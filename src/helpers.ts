import * as crypto from 'crypto';
import { JWTData } from "./definitions";

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parses the encoded JWT token and checks for its expiry
 * 
 * @param token string, encoded jwt
 * @returns boolean, indication of whether the token is expired
 * or not
 */
 export const isTokenExpired = (token: string): boolean => {
	const verifyFunction = crypto.createVerify('RSA-SHA256');
	const [jwtHeaders,jwtPayload] = token.split('.');
	verifyFunction.write(jwtHeaders + '.' + jwtPayload);
	verifyFunction.end();

	const base64Payload = jwtPayload.replace(/-/g, '+').replace(/_/g, '/');
	const jsonPayload = decodeURIComponent(
		Buffer.from(base64Payload, 'base64')
			.toString()
			.split('')
			.map((c) => {
				return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
			})
			.join(''),
	);

	const jwtData = JSON.parse(jsonPayload) as JWTData;
	const { exp } = jwtData;
	console.log('expires at: ', new Date(exp*1000));
	const isExpired = Date.now() >= exp * 1000;
    return isExpired;
};