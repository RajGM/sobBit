const querystring = require('querystring');

function buildAuthorizationUrl(telegram_id) {
  const authorizationUrl = 'https://oauth.staging.blink.sv/oauth2/auth';
  const params = {
    response_type: 'code',
    client_id: 'e894e905-3e7f-4705-a9a7-9fee4497ca4e',
    redirect_uri: 'https://tg-staging.lightningnode.info/callback',
    scope: 'read receive write',
    state: telegram_id  // Uncomment and add if you need state parameter
  };

  return `${authorizationUrl}?${querystring.stringify(params)}`;
}

//console.log(buildAuthorizationUrl('test123'))
//redirect_uri:'https://aad8-49-43-112-161.ngrok-free.app/',
    
module.exports = buildAuthorizationUrl; // Export the function directly
