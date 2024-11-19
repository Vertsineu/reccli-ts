import RecAPI from "./RecAPI";

const api = new RecAPI();

async function main() {
    await api.login("Username", "Password");
    const userInfo = await api.getUserInfo();
    console.log(userInfo);
}

main().catch(console.error);
