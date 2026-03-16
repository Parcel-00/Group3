/**
 * Shipment Processor Module
 * Handles image upload, OCR processing, and manifest matching
 */

import Tesseract from 'tesseract.js';
import fs from 'fs/promises';
import path from 'path';
import { ManifestParser } from './manifestParser.js';

export class ShipmentProcessor {
  constructor(manifestDir, uniqueIdDir) {
    this.manifestDir = manifestDir;
    this.uniqueIdDir = uniqueIdDir;
    this.manifestCache = new Map();
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
   * @returns {Object} Complete shipment data as JSON
   */
  generateShipmentJSON(matchResult, imageName) {
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
        extractionMethod: 'OCR_TESSERACT'
      }
    };

    return shipmentData;
  }

  /**
   * Process complete workflow: upload -> OCR -> match -> generate JSON
   * @param {string} imagePath - Path to uploaded image
   * @returns {Promise<Object>} Complete shipment JSON data
   */
  async processShipment(imagePath) {
    const imageName = path.basename(imagePath);

    // Step 1: Extract text from image
    const extractedText = await this.extractTextFromImage(imagePath);

    // Step 2: Find matching manifest
    const matchResult = this.findMatchingManifest(extractedText);

    // Step 3: Generate JSON output
    const shipmentJSON = this.generateShipmentJSON(matchResult, imageName);

    return shipmentJSON;
  }
}

export default ShipmentProcessor;
