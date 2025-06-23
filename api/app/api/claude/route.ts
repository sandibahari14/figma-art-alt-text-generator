// app/api/claude/route.ts
import { NextRequest, NextResponse } from 'next/server';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Get API key from environment variables
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      console.error('CLAUDE_API_KEY not found in environment variables');
      return NextResponse.json(
        { error: 'CLAUDE_API_KEY not configured' },
        { 
          status: 500,
          headers: corsHeaders
        }
      );
    }

    console.log('Making request to Claude API...');
    console.log('Request model:', body.model);
    console.log('Request has messages:', !!body.messages);
    
    // Make request to Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    console.log('Claude API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      return NextResponse.json(
        { error: 'Claude API error', details: errorText },
        { 
          status: response.status,
          headers: corsHeaders
        }
      );
    }

    const result = await response.json();
    console.log('Successfully received response from Claude');
    
    return NextResponse.json(result, {
      headers: corsHeaders
    });

  } catch (error: unknown) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { 
        status: 500,
        headers: corsHeaders
      }
    );
  }
}