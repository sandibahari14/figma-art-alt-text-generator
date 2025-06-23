figma.showUI(__html__, { width: 400, height: 600 });

// Your deployed API URL - replace with your own deployment
const API_URL = 'https://your-plugin-api.vercel.app/api/claude';

function analyzeNode(node) {
  console.log('Analyzing:', node.name, 'Type:', node.type);
  
  const analysis = {
    hasImageFill: false,
    imageNode: null
  };
  
  // Check the node itself for image fills
  if ('fills' in node && node.fills && node.fills.length > 0) {
    for (let i = 0; i < node.fills.length; i++) {
      const fill = node.fills[i];
      if (fill.type === 'IMAGE') {
        analysis.hasImageFill = true;
        analysis.imageNode = node;
        console.log('Found IMAGE fill on main node');
        return analysis;
      }
    }
  }
  
  // Check children
  if ('children' in node && node.children && node.children.length > 0) {
    console.log('Checking children for image content...');
    
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      console.log('Child:', child.name, 'Type:', child.type);
      
      if ('fills' in child && child.fills && child.fills.length > 0) {
        for (let j = 0; j < child.fills.length; j++) {
          const fill = child.fills[j];
          if (fill.type === 'IMAGE') {
            analysis.hasImageFill = true;
            analysis.imageNode = child;
            console.log('Found IMAGE fill in child:', child.name);
            return analysis;
          }
        }
      }
      
      // Check nested children
      if ('children' in child && child.children && child.children.length > 0) {
        const childAnalysis = analyzeNode(child);
        if (childAnalysis.hasImageFill) {
          return childAnalysis;
        }
      }
    }
  }
  
  console.log('No image content found');
  return analysis;
}

async function analyzeWithClaudeVision(imageNode, nodeName) {
  console.log('Exporting image for Claude Vision analysis...');
  
  // Export smaller image to avoid payload size limits
  const exported = await imageNode.exportAsync({
    format: 'PNG',
    constraint: { type: 'SCALE', value: 0.5 } // Reduce to 50% size
  });
  
  console.log('Image exported, size:', exported.byteLength);
  
  // If still too large, reduce further
  let finalExported = exported;
  if (exported.byteLength > 4000000) { // If > 4MB
    console.log('Image too large, reducing to 25% size...');
    finalExported = await imageNode.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 0.25 }
    });
    console.log('Reduced image size:', finalExported.byteLength);
  }
  
  const base64Image = figma.base64Encode(finalExported);
  
  console.log('Making request to API at:', API_URL);
  
  // Call your API endpoint
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Create alt text for this artwork in exactly 150-200 characters. Include the artist name and medium if visible, then describe the key visual elements, colors, and mood. Focus on what someone who cannot see the image needs to know.'
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Image
            }
          }
        ]
      }]
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API error:', errorText);
    throw new Error(`API failed: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  let altText = result.content[0].text.trim();
  
  // Ensure it stays within character limit
  if (altText.length > 200) {
    console.log(`Alt text too long (${altText.length} chars), trimming to 200...`);
    altText = altText.substring(0, 197) + '...';
  }
  
  return altText;
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'analyze' || msg.type === 'reprocess') {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      figma.ui.postMessage({
        type: 'error',
        message: 'Please select an artwork'
      });
      return;
    }
    
    let itemsToProcess = selection;
    
    // If reprocessing, filter to only the specified items
    if (msg.type === 'reprocess' && msg.items) {
      itemsToProcess = selection.filter(node => msg.items.includes(node.name));
    }
    
    figma.ui.postMessage({
      type: 'status',
      message: msg.type === 'reprocess' ? 'Reprocessing selected items...' : 'Analyzing selected artwork...'
    });
    
    const results = [];
    
    for (let i = 0; i < itemsToProcess.length; i++) {
      const node = itemsToProcess[i];
      const analysis = analyzeNode(node);
      
      if (analysis.hasImageFill) {
        try {
          figma.ui.postMessage({
            type: 'status',
            message: `Processing ${node.name} with Claude Vision... (${i + 1}/${itemsToProcess.length})`
          });
          
          console.log('Analyzing with Claude Vision...');
          const altText = await analyzeWithClaudeVision(analysis.imageNode, node.name);
          
          results.push({
            name: node.name,
            success: true,
            altText: altText,
            charCount: altText.length,
            imageNodeName: analysis.imageNode.name
          });
          
        } catch (error) {
          console.error('Claude Vision failed:', error);
          results.push({
            name: node.name,
            success: false,
            error: error.message,
            imageNodeName: analysis.imageNode.name
          });
        }
      } else {
        results.push({
          name: node.name,
          success: false,
          error: 'No image content found'
        });
      }
    }
    
    figma.ui.postMessage({
      type: 'results',
      results: results
    });
  }
};