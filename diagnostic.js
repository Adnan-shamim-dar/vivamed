// Diagnostic script to test StepFun API directly
const STEPFUN_API_KEY = "7APT45W336fyMfyXqQqVGXwtX1MweaaeVFTEmlPUiypCr8ErtllJ2dAG30i8bQzOv";

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║         VIVAMED API DIAGNOSTIC TOOL (StepFun)            ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('1️⃣  API KEY CHECK');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('API Key present:', !!STEPFUN_API_KEY);
if (STEPFUN_API_KEY) {
  console.log('Key prefix:', STEPFUN_API_KEY.substring(0, 20) + '...');
  console.log('Key length:', STEPFUN_API_KEY.length);
}
console.log('');

console.log('2️⃣  TESTING STEPFUN API');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

async function testAPI() {
  try {
    console.log('Making POST request to: https://api.stepfun.com/v1/chat/completions');
    console.log('Model: stepfun/step-3.5-flash:free');
    console.log('');

    const response = await fetch('https://api.stepfun.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STEPFUN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'stepfun/step-3.5-flash:free',
        messages: [{ role: 'user', content: 'Generate one medical viva question about cardiology in one sentence' }],
        temperature: 0.7,
        max_tokens: 200
      })
    });

    console.log('✓ Response received');
    console.log('Status:', response.status, response.statusText);
    console.log('');

    const data = await response.text();
    console.log('Response body (first 500 chars):');
    console.log(data.substring(0, 500));
    console.log('');

    if (response.ok) {
      const json = JSON.parse(data);
      if (json.choices && json.choices[0] && json.choices[0].message) {
        console.log('✅ ✅ ✅ API IS WORKING! ✅ ✅ ✅');
        console.log('Generated question:', json.choices[0].message.content);
      }
    } else {
      console.log('❌ ❌ ❌ API RETURNED ERROR ❌ ❌ ❌');
      const errorData = JSON.parse(data);
      console.log('Error:', errorData);

      if (response.status === 401) {
        console.log('\n⚠️  AUTHENTICATION ERROR');
        console.log('The API key appears to be invalid or expired');
        console.log('Status: ' + errorData.error?.message);
      }
    }

  } catch(error) {
    console.log('❌ Error:', error.message);
    console.log('Stack:', error.stack);
  }
}

testAPI();
console.log('\n');
