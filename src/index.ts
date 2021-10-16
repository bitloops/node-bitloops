const axios = require('axios').default;

export enum AuthTypes {
	Basic = 'basic',
	X_API_KEY = 'x-api-key',
	Token = 'token',
	BitloopsUser = 'bitloopsuser',
}

export enum AuthProviders {
	FIREBASE = 'firebase',
}

export interface IFirebaseUser {
	accessToken: string
}

export interface IAuthenticationOptions {
	authenticationType: AuthTypes;
}

export interface IFirebaseAuthenticationOptions extends IAuthenticationOptions {
	provider: AuthProviders;
	providerId: string;
	user: IFirebaseUser,
	credentials?: never,
}

export interface IAPIAuthenticationOptions extends IAuthenticationOptions {
	credentials: string,
	provider?: never;
	providerId?: never;
	user?: never,
}

export type BitloopsConfig = {
	apiKey: string,
	server: string,
	ssl?: boolean,
	workspaceId: string,
	messagingSenderId: string,
}

class Bitloops {
	config: BitloopsConfig;
	authType: AuthTypes;
	authOptions: IFirebaseAuthenticationOptions | IAPIAuthenticationOptions;

	constructor(config: BitloopsConfig) {
		this.config = config;
	}

	public static async initialize(config: BitloopsConfig): Promise<Bitloops> {
		return new Bitloops(config);
	}

	public authenticate(options: IFirebaseAuthenticationOptions | IAPIAuthenticationOptions): void {
		this.authOptions = options;
	}

	public async r(requestId: string, options?: any): Promise<any> {
		return this.request(requestId, options);
	}

	public async request(requestId: string, options?: any): Promise<any> {
		const body = { 
			messageId: requestId,
			workspaceId: this.config.workspaceId, 
		};
		const response = await axios({
			method: 'post',
			headers: {'Content-Type': 'application/json', 'Authorization': `${this.authOptions.authenticationType} ${this.authOptions?.user?.accessToken || this.authOptions.credentials}`},
			url: `${this.config.ssl === false?'http':'https'}://${this.config.server}/bitloops/request`,
			data: body,
		  });
		return response.data;
	} 

	public async p(messageId: string, options?: any): Promise<any> {
		return this.request(messageId, options); 
	}

	public async publish(messageId: string, options?: any): Promise<any> {
		const body = { 
			messageId: messageId,
			workspaceId: this.config.workspaceId, 
		};
		await axios({
			method: 'post',
			headers: {'Content-Type': 'application/json', 'Authorization': `${this.authOptions.authenticationType} ${this.authOptions?.user?.accessToken || this.authOptions.credentials}`},
			url: `${this.config.ssl === false?'http':'https'}://${this.config.server}/bitloops/request`,
			data: body,
		});
		return true;
	}
}

export default Bitloops;