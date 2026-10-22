#!/usr/bin/env node
// Validate every product image path before a change can be accepted.
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const dataPath = path.join(root, 'products.json');
const products = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const errors = [];
const seen = new Map();

if (!Array.isArray(products)) {
  console.error('FAIL: products.json must contain a JSON array.');
  process.exit(1);
}

products.forEach((product, index) => {
  const label = product.name || `product #${index + 1}`;
  if (!product.image || typeof product.image !== 'string') {
    errors.push(`${label}: missing image path`);
    return;
  }
  const imagePath = product.image.replace(/^\.\//, '');
  if (path.isAbsolute(imagePath) || imagePath.split('/').includes('..')) {
    errors.push(`${label}: unsafe image path "${product.image}"`);
    return;
  }
  const absolute = path.resolve(root, imagePath);
  if (!absolute.startsWith(root + path.sep)) {
    errors.push(`${label}: image path escapes repository`);
    return;
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    errors.push(`${label}: image file not found: ${product.image}`);
    return;
  }
  if (seen.has(imagePath)) {
    console.warn(`WARN: image path reused by "${label}" and "${seen.get(imagePath)}": ${imagePath}`);
  } else {
    seen.set(imagePath, label);
  }
});

if (errors.length) {
  console.error(`FAIL: ${errors.length} product image/path problem(s):`);
  for (const error of errors) console.error(' - ' + error);
  console.error('Do not publish until every missing image is added or its path is corrected.');
  process.exit(1);
}

console.log(`PASS: all ${products.length} product image paths point to existing files.`);
