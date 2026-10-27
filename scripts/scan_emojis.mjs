import fs from "fs";
import path from "path";

function findEmojisInDir(dir) {
  const emojiRegex =
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/u;
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      if (file.name !== "node_modules" && file.name !== ".output" && file.name !== "dist") {
        findEmojisInDir(fullPath);
      }
    } else if (/\.(tsx|ts|jsx|js|css|html)$/.test(file.name)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        if (emojiRegex.test(line)) {
          console.log(`EMOJI FOUND at ${fullPath}:${index + 1}: ${line.trim()}`);
        }
      });
    }
  }
}

findEmojisInDir("src");
console.log("Emoji scan complete.");
