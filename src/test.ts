//     "start:dev": "nodemon --config nodemon.json src/test.ts",

import Bitloops, { AuthProviders, AuthTypes } from './index';

const bitloopsConfig = {
	apiKey: "kgyst344ktst43kyygk4tkt4s",
	server: "localhost:3005",
	ssl: false,
	workspaceId: "db24bb48-d2e3-4433-8fd0-79eef2bf63df",
	messagingSenderId: "742387243782",
}

const test = async () => {
	const bitloops = await Bitloops.initialize(bitloopsConfig);
	bitloops.authenticate({
		authenticationType: AuthTypes.FirebaseUser,
		provider: {
			type: AuthProviders.FIREBASE,
			id: 'myProviderId', // You set this in the Bitloops Console
		},
		user: { accessToken: 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImYwNTM4MmFlMTgxYWJlNjFiOTYwYjA1Yzk3ZmE0MDljNDdhNDQ0ZTciLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiVmFzaWxpcyBEYW5pYXMiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EtL0FPaDE0R2d6YkdhdzY0Znp0YVpZYWZkRGNGejlaNHZnVDVDUllza3NieVlNS2c9czk2LWMiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vYml0bG9vcHMtbWFuYWdlZCIsImF1ZCI6ImJpdGxvb3BzLW1hbmFnZWQiLCJhdXRoX3RpbWUiOjE2MzQzMjM5MTcsInVzZXJfaWQiOiI5OTZPMmxmck9iaFBDT1lSUTl1bGNYN05vNzgyIiwic3ViIjoiOTk2TzJsZnJPYmhQQ09ZUlE5dWxjWDdObzc4MiIsImlhdCI6MTYzNDM3OTgyOCwiZXhwIjoxNjM0MzgzNDI4LCJlbWFpbCI6InZhc2lsaXNAYml0bG9vcHMuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZ29vZ2xlLmNvbSI6WyIxMDQzODg5OTg5OTU3MzE4OTY5NzEiXSwiZW1haWwiOlsidmFzaWxpc0BiaXRsb29wcy5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJnb29nbGUuY29tIn19.cdqTD0joQIBwYR7o_09eT-De_i8gy8V5ku5BRMpiB4USp9FMnQctYu-ajiqoQqVAuPjHP44l8NtFZOIv8tDd_p7MHJjEdXKN3Ys8_hn0F5JRD8X1fd7D5tBFM-A2re2HzTw-miy5LTGkm8c-MmGqKrXPHU2-aAuLQInBJIKhE6mI165ANK-sG0pV6q7MTaPZJ6Z3oPzt-akfR0Eg4uG6ncyD9Un4aUXQrnxhOvs45M4dtvP_Yio2zMqjZJrxk5Iyp5pnmbjwrmRPutC7eBzi0Uiayc3kmSM_roYYEhw3kE24XisioriXt5EShopZlEnfbkaNueSMmBXKxo52rdB0XQ' },
	});
	const workspaces = await bitloops.r('workspaces.getAll');
	console.log(workspaces);
}

test();