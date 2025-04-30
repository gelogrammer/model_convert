// Simple script to test Supabase RPC functions

const supabaseUrl = 'https://pztstrmccavxrgccvmjq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6dHN0cm1jY2F2eHJnY2N2bWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5MzExNDEsImV4cCI6MjA2MTUwNzE0MX0.a3fTAAaTip_DenzWBWBoTjRD-ARiZRdXqmwE7Rgz6Yg';

async function testSupabaseFunctions() {
  console.log('Testing Supabase RPC functions...');
  
  try {
    // First, try to create the recordings table
    console.log('Testing create_recordings_table_if_not_exists function...');
    
    const tableResult = await fetch(`${supabaseUrl}/rest/v1/rpc/create_recordings_table_if_not_exists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({})
    });
    
    const tableData = await tableResult.json();
    console.log('Table creation result:', tableData);
    
    // Then, try to create the recordings bucket
    console.log('Testing create_recordings_bucket_if_not_exists function...');
    
    const bucketResult = await fetch(`${supabaseUrl}/rest/v1/rpc/create_recordings_bucket_if_not_exists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({})
    });
    
    const bucketData = await bucketResult.json();
    console.log('Bucket creation result:', bucketData);
    
    console.log('Tests completed successfully!');
  } catch (error) {
    console.error('Error testing Supabase RPC functions:', error);
  }
}

// Execute the test
testSupabaseFunctions(); 