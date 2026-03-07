const express = require("express");
const cors = require("cors");

const app = express();

app.use(
  cors({
    origin: [
      "https://gowildkarunadu.vercel.app"
    ],
    methods: ["GET","POST","PUT","DELETE"],
    credentials: true
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("API running 🚀");
});

module.exports = app;