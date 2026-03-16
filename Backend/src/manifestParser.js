/**
 * Manifest Parser Module
 * Parses shipment manifest text files and extracts structured data
 */

export class ManifestParser {
  /**
   * Parse manifest text content
   * @param {string} text - Raw manifest text
   * @returns {Object} Parsed manifest data
   */
  static parseManifest(text) {
    const manifest = {
      container: {},
      items: [],
      metadata: {}
    };

    const lines = text.split('\n').map(line => line.trim()).filter(line => line);

    // Extract container title/number
    const titleMatch = lines[0].match(/Shipping container (\d+)/i);
    if (titleMatch) {
      manifest.container.number = parseInt(titleMatch[1]);
      manifest.container.title = lines[0];
    }

    // Parse key-value pairs for container info
    let currentSection = null;
    const inventory = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // Skip section headers
      if (line.toLowerCase() === 'inventory') {
        currentSection = 'inventory';
        continue;
      }

      // Parse inventory items
      if (currentSection === 'inventory') {
        if (line.startsWith('- Item:')) {
          const itemText = line.replace('- Item:', '').trim();
          const item = { description: itemText };
          
          // Collect subsequent item properties
          let j = i + 1;
          while (j < lines.length && lines[j].startsWith('- ') && !lines[j].includes('Item:')) {
            const propLine = lines[j].replace('- ', '').trim();
            const [key, value] = propLine.split(':').map(s => s.trim());
            
            if (key && value) {
              const normalizedKey = this.normalizeKey(key);
              item[normalizedKey] = this.parseValue(value);
            }
            j++;
          }
          i = j - 1;
          inventory.push(item);
        }
      } else if (line.includes(':') && !line.startsWith('-')) {
        // Parse container properties
        const [key, value] = line.split(':').map(s => s.trim());
        if (key && value) {
          const normalizedKey = this.normalizeKey(key);
          manifest.container[normalizedKey] = this.parseValue(value);
        }
      }
    }

    manifest.items = inventory;
    manifest.metadata.processingDate = new Date().toISOString();
    manifest.metadata.totalItems = inventory.length;

    return manifest;
  }

  /**
   * Normalize property keys to camelCase
   * @param {string} key - Original key
   * @returns {string} Normalized key
   */
  static normalizeKey(key) {
    return key
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[()]/g, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
      .join('')
      .replace(/\s/g, '');
  }

  /**
   * Parse value to appropriate type
   * @param {string} value - Raw value string
   * @returns {*} Parsed value
   */
  static parseValue(value) {
    // Try to parse as number
    const numMatch = value.match(/^([\d,]+(?:\.\d+)?)/);
    if (numMatch) {
      const num = parseFloat(numMatch[1].replace(/,/g, ''));
      if (!isNaN(num)) return num;
    }

    // Return as string
    return value;
  }
}

export default ManifestParser;
