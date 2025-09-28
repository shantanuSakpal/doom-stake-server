require("dotenv").config();
const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const multer = require("multer");
const OpenAI = require("openai");
// web3 integration
const { ethers } = require("ethers");

const app = express();
const port = process.env.PORT || 3000;
const API_BASE_URL = "http://localhost:8000"; // Change to your Akave API URL
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json({ limit: "5mb" }));

// read abi file
const ABI = JSON.parse(fs.readFileSync("abi.json"));
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PROVIDER_URL = process.env.PROVIDER_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// calls the slash function
app.get("/slash", async (_req, res) => {
  // get address from params
  const address = _req.query.address;
  console.log(address);
  if (!address) {
    return res.status(400).json({ error: "Address is required" });
  }

  try {
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

    const tx = await contract.slash(address);
    await tx.wait();

    res.json({ success: true, txHash: tx.hash });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to slash", details: error.message });
  }
});

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Bucket Operations
// 1. Create a Bucket
app.post("/buckets", async (req, res) => {
  const { bucketName } = req.body || {};
  if (!bucketName) {
    return res
      .status(400)
      .json({ error: 'Missing "bucketName" in request body.' });
  }
  try {
    const response = await axios.post(`${API_BASE_URL}/buckets`, {
      bucketName,
    });
    res.json(response.data);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Failed to create bucket", details: error.message });
  }
});

// 2. List Buckets
app.get("/buckets", async (_req, res) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/buckets`);
    res.json(response.data);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Failed to list buckets", details: error.message });
  }
});

// 3. View Bucket Details
app.get("/buckets/:bucketName", async (req, res) => {
  const { bucketName } = req.params;
  try {
    const response = await axios.get(`${API_BASE_URL}/buckets/${bucketName}`);
    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: `Failed to fetch details for bucket: ${bucketName}`,
      details: error.message,
    });
  }
});

// 4. Delete a Bucket
app.delete("/buckets/:bucketName", async (req, res) => {
  const { bucketName } = req.params;
  try {
    const response = await axios.delete(
      `${API_BASE_URL}/buckets/${bucketName}`
    );
    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: `Failed to delete bucket: ${bucketName}`,
      details: error.message,
    });
  }
});

// File Operations
// 1. List Files in a Bucket
app.get("/buckets/:bucketName/files", async (req, res) => {
  const { bucketName } = req.params;
  try {
    const response = await axios.get(
      `${API_BASE_URL}/buckets/${bucketName}/files`
    );
    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: `Failed to list files for bucket: ${bucketName}`,
      details: error.message,
    });
  }
});

// 2. Get File Info
app.get("/buckets/:bucketName/files/:fileName", async (req, res) => {
  const { bucketName, fileName } = req.params;
  try {
    const response = await axios.get(
      `${API_BASE_URL}/buckets/${bucketName}/files/${fileName}`
    );
    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: `Failed to fetch file info for: ${fileName}`,
      details: error.message,
    });
  }
});

// 3. Upload a File
app.post("/buckets/:bucketName/files", async (req, res) => {
  const { bucketName } = req.params;
  const { filePath } = req.body || {};

  if (!filePath || typeof filePath !== "string") {
    return res
      .status(400)
      .json({ error: 'Missing or invalid "filePath" in request body.' });
  }

  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));

  try {
    const response = await axios.post(
      `${API_BASE_URL}/buckets/${bucketName}/files`,
      form,
      {
        headers: form.getHeaders(),
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: `Failed to upload file to bucket: ${bucketName}`,
      details: error.message,
    });
  }
});

// Pinata Upload - Upload an image to Pinata using direct curl-style request
app.post("/upload-image", upload.single("image"), async (req, res) => {
  const pinataJwt = process.env.PINATA_SECRET_ACCESS_TOKEN;
  const pinataBaseUrl =
    process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud";
  if (!pinataJwt) {
    return res.status(500).json({
      error:
        "PINATA_SECRET_ACCESS_TOKEN environment variable is not configured.",
    });
  }

  if (!req.file) {
    return res
      .status(400)
      .json({ error: 'Missing "image" file in multipart/form-data request.' });
  }

  const network = req.body.network || "public";
  const name = req.body.name;
  const groupId = req.body.group_id;

  let keyvalues;
  if (req.body.keyvalues) {
    try {
      keyvalues = JSON.parse(req.body.keyvalues);
      if (typeof keyvalues !== "object" || Array.isArray(keyvalues)) {
        throw new Error("Keyvalues must be a JSON object.");
      }
    } catch (error) {
      return res.status(400).json({
        error:
          'Invalid "keyvalues" format. Provide a valid JSON string representing key-value pairs.',
      });
    }
  }

  try {
    const form = new FormData();
    form.append("network", network);
    form.append("file", req.file.buffer, {
      filename: req.file.originalname || "upload",
      contentType: req.file.mimetype || "application/octet-stream",
    });

    if (name) {
      form.append("name", name);
    }

    if (groupId) {
      form.append("group_id", groupId);
    }

    if (keyvalues) {
      Object.entries(keyvalues).forEach(([key, value]) => {
        form.append(`keyvalues[${key}]`, String(value));
      });
    }

    const response = await axios.post(
      "https://uploads.pinata.cloud/v3/files",
      form,
      {
        headers: {
          Authorization: `Bearer ${pinataJwt}`,
          ...form.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    const data = response.data?.data;
    if (!data?.cid) {
      throw new Error("Pinata response missing CID.");
    }

    const fileUrl = `${pinataBaseUrl}/ipfs/${data.cid}`;

    // res.json({
    //   id: data.id,
    //   name: data.name,
    //   cid: data.cid,
    //   url: fileUrl,
    //   network: data.network || network,
    //   createdAt: data.created_at,
    //   size: data.size,
    //   numberOfFiles: data.number_of_files,
    //   mimeType: data.mime_type,
    //   userId: data.user_id,
    //   groupId: data.group_id,
    //   isDuplicate: data.is_duplicate,
    // });

    //send to openai

    const body = {
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Does this image show a human hand touching grass? if can be grass or any other plants found outdoor. make sure to check the image carefully and see if its not a plat that is in a house or any other indoor environment. make sure to answer yes or no. only answer yes or no.",
            },
            {
              type: "image_url",
              image_url: {
                url: fileUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 300,
    };

    const openairesponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      body,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    console.log(openairesponse.data);

    /* response.data = {
    "id": "chatcmpl-CKFw1zfILV2eQsocaw5YVIlLrdVnU",
    "object": "chat.completion",
    "created": 1758943849,
    "model": "gpt-4.1-mini-2025-04-14",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "The image shows a close-up of a hand touching or resting on a patch of green grass. The hand appears to be spread out with fingers extended, and the background is filled with grass. The scene seems to be outdoors.",
                "refusal": null,
                "annotations": []
            },
            "logprobs": null,
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 102,
        "completion_tokens": 45,
        "total_tokens": 147,
        "prompt_tokens_details": {
            "cached_tokens": 0,
            "audio_tokens": 0
        },
        "completion_tokens_details": {
            "reasoning_tokens": 0,
            "audio_tokens": 0,
            "accepted_prediction_tokens": 0,
            "rejected_prediction_tokens": 0
        }
    },
    "service_tier": "default",
    "system_fingerprint": "fp_6d7dcc9a98"
}*/

    //extract the text from the openai response
    const openaiText = openairesponse.data.choices[0].message.content;
    console.log(openaiText);

    //normalise the openai text to true or false
    const modelResponse = openaiText.toLowerCase().includes("yes")
      ? true
      : false;
    res.json({
      fileUrl: fileUrl,
      modelResponse: modelResponse,
    });
  } catch (error) {
    console.error("Pinata upload failed", error);
    const status = error.response?.status || 500;
    const details = error.response?.data || error.message;
    res.status(status).json({
      error: "Failed to upload image to Pinata.",
      details,
    });
  }
});

// 4. Download a File
app.get("/buckets/:bucketName/files/:fileName/download", async (req, res) => {
  const { bucketName, fileName } = req.params;
  const outputDir = req.query.outputDir || "."; // Default to current directory

  try {
    const response = await axios.get(
      `${API_BASE_URL}/buckets/${bucketName}/files/${fileName}/download`,
      {
        responseType: "arraybuffer",
      }
    );
    fs.writeFileSync(`./${outputDir}/${fileName}`, response.data);
    res.send(`File ${fileName} downloaded successfully.`);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: `Failed to download file: ${fileName}`,
      details: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
