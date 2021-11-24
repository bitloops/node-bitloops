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
import Bitloops, { AuthProviders, AuthTypes } from 'bitloops';
import { getAuth, onAuthStateChanged, onAuthStateChanged } from 'firebase/auth'; // If you are using Firebase

// You will get this from your Console in your Workflow information
const bitloopsConfig = {
	apiKey: "kgyst344ktst43kyygk4tkt4s",
	server: "bitloops.net",
	environmentId: "3c42a5ef-fe21-4b50-8128-8596ea47da93",
	workspaceId: "4f7a0fc5-fe2f-450a-b246-11a0873e91f0",
	messagingSenderId: "742387243782",
}

await bitloops.initialize(bitloopsConfig);

const auth = getAuth();
const refreshTokenFunction =
      (): Promise<string | null> => new Promise<string | null>((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          unsubscribe();
          if (user) {
            getIdToken(user, true).then((idToken: string) => {
              resolve(idToken);
            }, (error) => {
              reject(error);
            });
          } else {
            resolve(null);
          }
        });
      });
onAuthStateChanged(auth, (user) => {
  if (user) {
    // If you are using Firebase authentication you need to pass
	// the user auth data as context for your web requests
    bitloops.authenticate({ 
		authenticationType: AuthTypes.FirebaseUser,
		providerId: 'myProviderId', // You set this in the Bitloops Console
		user,
    refreshTokenFunction, // used to refresh the token when it expires
	});
  } else {
    // User is signed out
    bitloops.signOut();
  }
});

...
// If you want to pass a username/password combo you should first initialize
// and then authenticate using a username / password combo over https

// await bitloops.initialize(bitloopsConfig);
// bitloops.authenticate({ 
// 	provider: AuthProviders.BITLOOPS_USER_PASS, 
// 	username, 
// 	password,
// });

const userInfo = await bitloops.request('db7a654a-1e2c-4f9c-b2d0-8ff2e2d6cbfe');
const productInfo = await bitloops.request('64f264ad-76b1-4ba1-975c-c7b9795e55ce', { productId: '7829' });
bitloops.publish('page-visited-event', { page: 'landing-page'});
```

> _PRO TIP_: The second argument passed in the _product.getProductInfo_ request and in the p_age-visited-event_ publish message containing the data of the request/publish message is using a shortcut notation which you can use if the only arguments other than the _requestId_ or the _messageId_ are the payload parameters. The full form is the following:

```ts
bitloops.publish('page-visited-event', { payload: { page: 'landing-page' } } );
```
>
The above is equivalent to:
```ts
bitloops.p('page-visited-event', { page: 'landing-page' });
```


This means that if you need to pass more settings to the request / publish message then you need to explicitly define the _payload_ argument.

### Testing Example

To ask your workflows to return mocked values based on your test scenarios you can pass the _testScenarioId_ along with your request.

```ts
const productInfo = await bitloops.request('product.getProductInfo', {
	payload: { productId: '7829' }, 
	testScenarioId: 'Test-Scenario-1'
});
```

### Subscriptions

```ts
const callback = (data: any) => {
  console.log('Received', data);
}
bitloops.subscribe('ride-requested', callback);
```

## Questions?

Please post your questions on [Stack Overflow](https://stackoverflow.com) making sure you use the **Bitloops** tag and someone from the Bitloops team or the community will make sure to help you. 

Alternatively feel free to [submit an Issue on GitHub](https://github.com/bitloops/node-bitloops/issues/new).