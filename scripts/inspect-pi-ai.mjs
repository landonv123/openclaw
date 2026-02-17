
import * as PiAi from "@mariozechner/pi-ai";

console.log("Keys in @mariozechner/pi-ai:", Object.keys(PiAi));

// Check for common names
const candidates = ["CLIENT_ID", "OPENAI_CLIENT_ID", "CODEX_CLIENT_ID", "OAUTH_CONFIG"];
for (const key of candidates) {
    if (key in PiAi) {
        console.log(`Found ${key}:`, PiAi[key]);
    }
}

// Try to inspect the login function if it has attached properties
if (PiAi.loginOpenAICodex) {
    console.log("loginOpenAICodex keys:", Object.keys(PiAi.loginOpenAICodex));
}

// If we can't find it effectively, we might need to dig into the internal modules
// But let's see what this gives first.
