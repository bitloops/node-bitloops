![Bitloops](https://bitloops.com/assets/img/bitloops-logo_320x80.png)

# bitloops

NodeJS library for the Bitloops

## Usage

### Installing

Using npm:

```bash
$ npm install bitloops
```

Using yarn:

```bash
$ yarn add bitloops
```

### TypeScript Frontend usage Example

```ts
import Bitloops, { AuthTypes, BitloopsUser, getAuth } from 'bitloops';

// You will get this from your Console in your Workflow information
const bitloopsConfig = {
	apiKey: "kgyst344ktst43kyygk4tkt4s",
	server: "bitloops.net",
	environmentId: "3c42a5ef-fe21-4b50-8128-8596ea47da93",
	workspaceId: "4f7a0fc5-fe2f-450a-b246-11a0873e91f0",
	messagingSenderId: "742387243782",
  auth: {
    authenticationType: AuthTypes.User,
    providerId: 'myProviderId', // You create this in the Bitloops Console
    clientId: 'myWebAppId', // You create this in the Bitloops Console
  }
}

bitloops.initialize(bitloopsConfig);

bitloops.auth.authorizeWithUsername('username', 'email', 'password');
bitloops.auth.authorizeWithEmail('email', 'password');
bitloops.auth.authorizeWithEmailLink('email');
bitloops.auth.authorizeWithEmailLinkVerification('link');
bitloops.auth.forgotPassword('email', 'username');
bitloops.auth.forgotPassword('email');
bitloops.auth.forgotPasswordLink('link');
bitloops.auth.forgotPasswordLink('link', 'new-password');

bitloops.auth.authorizeWithGoogle();
bitloops.auth.registerWithGoogle();
bitloops.auth.addGoogle();
bitloops.auth.authorizeWithGitHub();
bitloops.auth.registerWithGitHub();
bitloops.auth.addGitHub();
bitloops.auth.authorizeWithTwitter();
bitloops.auth.registerWithTwitter();
bitloops.auth.addTwitter();

bitloops.auth.getUser();
bitloops.auth.clear();

bitloops.auth.onAuthStateChange((user: BitloopsUser) => {
  if (user) {
    // Do stuff when authenticated
  } else {
    // Do stuff if authentication is cleared
  }
});

...

const userInfo = await bitloops.request('db7a654a-1e2c-4f9c-b2d0-8ff2e2d6cbfe', '70e3084f-9056-4905-ac45-a5b65c926b1b');
const productInfo = await bitloops.request('64f264ad-76b1-4ba1-975c-c7b9795e55ce', '70e3084f-9056-4905-ac45-a5b65c926b1b', { productId: '7829' });
bitloops.publish('page-visited-event', { page: 'landing-page'});
```

> _PRO TIP_: The second argument passed in the _product.getProductInfo_ request and in the p*age-visited-event* publish message containing the data of the request/publish message is using a shortcut notation which you can use if the only arguments other than the _requestId_ or the _messageId_ are the payload parameters. The full form is the following:

```ts
bitloops.publish('page-visited-event', { payload: { page: 'landing-page' } });
```

> The above is equivalent to:

```ts
bitloops.p('page-visited-event', { page: 'landing-page' });
```

This means that if you need to pass more settings to the request / publish message then you need to explicitly define the _payload_ argument.

### Testing Example

To ask your workflows to return mocked values based on your test scenarios you can pass the _testScenarioId_ along with your request.

```ts
const productInfo = await bitloops.request('product.getProductInfo', {
  payload: { productId: '7829' },
  testScenarioId: 'Test-Scenario-1',
});
```

### Subscriptions

```ts
const callback = (data: any) => {
  console.log('Received', data);
};
bitloops.subscribe('ride-requested', callback);
```

## Questions?

Please post your questions on [Stack Overflow](https://stackoverflow.com) making sure you use the **Bitloops** tag and someone from the Bitloops team or the community will make sure to help you.

Alternatively feel free to [submit an Issue on GitHub](https://github.com/bitloops/node-bitloops/issues/new).
