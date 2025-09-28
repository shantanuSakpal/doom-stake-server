// calls the cleanup() function in the contract every 1 minute

const ethers = require("ethers");
const fs = require("fs");
require("dotenv").config();

const ABI = JSON.parse(fs.readFileSync("abi.json"));
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PROVIDER_URL = process.env.PROVIDER_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!CONTRACT_ADDRESS || !PROVIDER_URL || !PRIVATE_KEY) {
  console.error(
    "Please set CONTRACT_ADDRESS, PROVIDER_URL, and PRIVATE_KEY in your .env file"
  );
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

async function callCleanup() {
  try {
    console.log("Calling cleanup()...");
    const tx = await contract.cleanup();
    console.log("Transaction sent: ", tx.hash);
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
  } catch (error) {
    console.error("Error calling cleanup: ", error);
  } finally {
    setTimeout(callCleanup, 10000); // Call again after 60 seconds
  }
}

console.log("Repeater started, calling cleanup() every 10 seconds.");
callCleanup();
