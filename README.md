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

Using bower: 
```bash
$ bower install bitloops
```

### TypeScript Frontend usage Example
```ts
import bitloops, { AuthProviders } from 'bitloops';
import  from 'bitloops';

// You will get this from your Console in your Workflow information
const bitloopsConfig = {
	apiKey: "kgyst344ktst43kyygk4tkt4s",
	gatewayServer: "bitloops.net",
	workspaceId: "4f7a0fc5-fe2f-450a-b246-11a0873e91f0",
	messagingSenderId: "742387243782"
}

// If you are using Firebase authentication you can pass
// the user auth data as context for your web requests

bitloops.initialize(bitloopsConfig, { 
		provider: AuthProviders.FIREBASE, 
		authContext: firebase.user.getAuth(),
	}
);

// when the user logs out make sure you call: bitloops.logout();

// If you want to pass a username/password combo you should first initialize
// and then authenticate using a username / password combo over https

// bitloops.initialize(bitloopsConfig);
// await bitloops.authenticate(username, password);

const userInfo = await bitloops.request('user.getUserInfo');
const productInfo = await bitloops.request('product.getProductInfo', { productId: '7829' });
bitloops.publish('page-visited-event', { page: 'landing-page'});
```