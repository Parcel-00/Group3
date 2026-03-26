/**
 * Shipment Processor Module
 * Handles image upload, OCR processing, and manifest matching
 */

import Tesseract from 'tesseract.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { ManifestParser } from './manifestParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ShipmentProcessor {
  constructor(manifestDir, uniqueIdDir, modelScriptPath = path.join(__dirname, '..', '..', 'model_build.py')) {
    this.manifestDir = manifestDir;
    this.uniqueIdDir = uniqueIdDir;
    this.manifestCache = new Map();
    this.modelScriptPath = modelScriptPath; // Path to the Python model script
  }

  /**
   * Load all manifest files into cache
   */
  async loadManifests() {
    try {
      const files = await fs.readdir(this.manifestDir);
      const textFiles = files.filter(f => f.endsWith('.txt'));

      for (const file of textFiles) {
        try {
          const content = await fs.readFile(
            path.join(this.manifestDir, file),
            'utf-8'
          );
          const parsed = ManifestParser.parseManifest(content);
          const manifestId = file.replace('.txt', '');
          this.manifestCache.set(manifestId, {
            filename: file,
            parsedData: parsed,
            rawText: content
          });
        } catch (err) {
          console.error(`Error loading manifest ${file}:`, err);
        }
      }

      console.log(`Loaded ${this.manifestCache.size} manifests`);
      return this.manifestCache.size;
    } catch (err) {
      console.error('Error loading manifests:', err);
      throw err;
    }
  }

  /**
   * Process uploaded image and extract text using OCR
   * @param {string} imagePath - Path to uploaded image file
   * @returns {Promise<string>} Extracted text from image
   */
  async extractTextFromImage(imagePath) {
    try {
      console.log(`Processing image: ${imagePath}`);

      const { data: { text } } = await Tesseract.recognize(
        imagePath,
        'eng'
      );

      console.log('OCR processing completed');
      return text;
    } catch (err) {
      console.error('Error extracting text from image:', err);
      throw new Error(`OCR processing failed: ${err.message}`);
    }
  }

  /**
   * Detect damage in Lego piece image using TensorFlow model
   * @param {string} imagePath - Path to image file
   * @returns {Promise<Object>} Damage detection result
   */
  async detectDamage(imagePath) {
    try {
      console.log(`Detecting damage in: ${imagePath}`);

      // Call Python script directly using child_process
      const pythonProcess = spawn('python', [this.modelScriptPath, '--predict', imagePath], {
        cwd: path.dirname(this.modelScriptPath)
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      return new Promise((resolve, reject) => {
        // Set a timeout for the prediction (30 seconds should be enough)
        const timeout = setTimeout(() => {
          pythonProcess.kill();
          reject(new Error('Damage detection timed out after 30 seconds'));
        }, 30000);

        pythonProcess.on('close', (code) => {
          clearTimeout(timeout);
          
          if (code !== 0) {
            console.error('Python process error:', stderr);
            reject(new Error(`Damage detection failed: ${stderr}`));
            return;
          }

          try {
            // Strip ANSI escape codes from stdout
            const cleanStdout = stdout.replace(/\x1B\[[0-9;]*[mG]/g, '');
            
            // Find the JSON line in stdout (it might have logs before it)
            const lines = cleanStdout.split('\n');
            const jsonLine = lines.find(line => line.trim().startsWith('{'));
            
            if (!jsonLine) {
              reject(new Error('No JSON output found from Python script'));
              return;
            }

            const result = JSON.parse(jsonLine.trim());
            console.log('Damage detection completed:', result);

            resolve({
              isDamaged: result.damage_detected,
              damageProbability: result.damage_probability,
              confidence: result.confidence,
              modelUsed: 'TensorFlow_MobileNetV2'
            });
          } catch (parseErr) {
            console.error('Error parsing Python output:', parseErr);
            console.error('Raw stdout:', stdout);
            reject(new Error(`Failed to parse model output: ${parseErr.message}`));
          }
        });

        pythonProcess.on('error', (err) => {
          clearTimeout(timeout);
          console.error('Error spawning Python process:', err);
          reject(new Error(`Failed to start damage detection: ${err.message}`));
        });
      });
    } catch (err) {
      console.error('Error detecting damage:', err);
      // Return safe default if process fails
      return {
        isDamaged: false,
        damageProbability: 0,
        confidence: 0,
        error: err.message,
        modelUsed: 'TensorFlow_MobileNetV2'
      };
    }
  }

  /**
   * Find matching manifest based on image text content
   * @param {string} extractedText - Text extracted from image
   * @returns {Object} Best matching manifest and scores
   */
  findMatchingManifest(extractedText) {
    const textLower = extractedText.toLowerCase();
    const matches = [];

    // Score each manifest based on keyword matches
    for (const [id, manifest] of this.manifestCache) {
      let score = 0;
      const rawTextLower = manifest.rawText.toLowerCase();

      // Extract container ID from text
      const containerIdMatch = extractedText.match(
        /container\s*id[\s:]*([A-Z0-9]+)/i
      );
      if (containerIdMatch) {
        const extractedId = containerIdMatch[1].toUpperCase();
        if (manifest.parsedData.container.containerID === extractedId) {
          score += 100;
        }
      }

      // Match key fields
      const keyFields = ['container', 'item', 'quantity', 'kg', 'mass'];
      for (const field of keyFields) {
        if (textLower.includes(field)) {
          score += 5;
        }
      }

      // Count matching words
      const words = extractedText.split(/\s+/);
      for (const word of words) {
        if (rawTextLower.includes(word.toLowerCase()) && word.length > 3) {
          score += 2;
        }
      }

      matches.push({
        manifestId: id,
        manifest: manifest.parsedData,
        filename: manifest.filename,
        score,
        confidence: Math.min(100, score)
      });
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    return {
      topMatch: matches[0] || null,
      allMatches: matches.slice(0, 5),
      textExtracted: extractedText.slice(0, 500) // Include sample of extracted text
    };
  }

  /**
   * Generate comprehensive JSON output for a shipment
   * @param {Object} matchResult - Result from findMatchingManifest
   * @param {string} imageName - Name of uploaded image
   * @param {Object} damageResult - Result from damage detection
   * @returns {Object} Complete shipment data as JSON
   */
  generateShipmentJSON(matchResult, imageName, damageResult = null) {
    const { topMatch, allMatches, textExtracted } = matchResult;

    const shipmentData = {
      timestamp: new Date().toISOString(),
      imageProcessed: imageName,
      processingResult: {
        success: !!topMatch,
        confidenceScore: topMatch?.confidence || 0,
        matchedManifest: topMatch?.filename || null,
        alternativeMatches: allMatches
          .slice(1, 3)
          .map(m => ({
            filename: m.filename,
            confidence: m.confidence
          }))
      },
      ocr: {
        extractedTextSample: textExtracted,
        fullText: null // Can be populated if needed
      },
      shipmentDetails: topMatch
        ? {
            container: topMatch.manifest.container,
            items: topMatch.manifest.items,
            summary: {
              totalItems: topMatch.manifest.items.length,
              totalGrossMass:
                topMatch.manifest.items.reduce((sum, item) => {
                  if (typeof item.grossMass === 'number') return sum + item.grossMass;
                  return sum;
                }, 0) || 'N/A'
            }
          }
        : null,
      metadata: {
        processingStatus: topMatch ? 'SUCCESS' : 'NO_MATCH_FOUND',
        recordsChecked: allMatches.length,
        extractionMethod: 'OCR_TESSERACT',
        damageDetection: damageResult ? {
          performed: true,
          result: damageResult
        } : {
          performed: false,
          reason: 'Damage detection service not available'
        }
      }
    };

    return shipmentData;
  }

  /**
   * Process complete workflow: upload -> OCR -> match -> damage detection -> generate JSON
   * @param {string} imagePath - Path to uploaded image
   * @returns {Promise<Object>} Complete shipment JSON data
   */
  async processShipment(imagePath) {
    const imageName = path.basename(imagePath);

    // Step 1: Extract text from image
    const extractedText = await this.extractTextFromImage(imagePath);

    // Step 2: Find matching manifest
    const matchResult = this.findMatchingManifest(extractedText);

    // Step 3: Detect damage in the image
    const damageResult = await this.detectDamage(imagePath);

    // Step 4: Generate JSON output
    const shipmentJSON = this.generateShipmentJSON(matchResult, imageName, damageResult);

    return shipmentJSON;
  }
}

export default ShipmentProcessor;
