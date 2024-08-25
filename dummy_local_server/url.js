const querystring = require('querystring');

function buildAuthorizationUrl() {
  const authorizationUrl = 'https://oauth.staging.blink.sv/oauth2/auth';
  const params = {
    response_type: 'code',
    client_id: 'e894e905-3e7f-4705-a9a7-9fee4497ca4e',
    redirect_uri: 'https://tg-staging.lightningnode.info/callback',
    scope: 'read receive write',
    state: 'user_id1234'  // Uncomment and add if you need state parameter

  };

  return `${authorizationUrl}?${querystring.stringify(params)}`;
}

console.log(buildAuthorizationUrl())

//https://tg-staging.lightningnode.info/callback?code=ory_ac_P6dg7BbikaZZACXNHBlFThmbsD8if0vfCIABVr9jEi8.tW0tFzWRh4N1MuFuuOKW3iCOhZONFxZu0XvOCsCakAw&scope=read+receive+write&state=user_id1234

// ory_ac_P6dg7BbikaZZACXNHBlFThmbsD8if0vfCIABVr9jEi8.tW0tFzWRh4N1MuFuuOKW3iCOhZONFxZu0XvOCsCakAw