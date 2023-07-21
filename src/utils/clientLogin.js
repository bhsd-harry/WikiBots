import process from 'process';
import config from './config.js';

async function clientLogin(api, account, password) {
	try {
		const { data } = await api.postWithToken('login', {
			action: 'clientlogin',
			username: account,
			password: config.password || password,
			loginreturnurl: config.zh.api,
		}, { tokenName: 'logintoken' });
		if (data.clientlogin?.status !== 'PASS' || data.error) {
			throw new Error(data.error || data?.clientlogin?.message);
		} else {
			console.log(data);
		}
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
}

export default clientLogin;