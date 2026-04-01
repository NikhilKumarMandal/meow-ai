# 🐱 meow-ai

A TypeScript-based CLI tool that lets you chat with AI directly from your terminal, powered by the OpenAI API via the Vercel AI SDK.

---

## ✨ Features

- Interactive terminal-based AI chat interface
- Beautiful CLI UI with prompts, colors, and ASCII art banners
- Built with TypeScript for type safety
- Persistent configuration using `conf`
- Code formatting with Prettier and linting with ESLint

---

## 🛠️ Tech Stack

| Package | Purpose |
|---|---|
| `ai` (Vercel AI SDK) | Core SDK for interacting with AI models |
| `@ai-sdk/openai` | OpenAI provider for the Vercel AI SDK |
| `@clack/prompts` | Beautiful interactive terminal prompts |
| `chalk` | Terminal string styling and colors |
| `figlet` | ASCII art text banners |
| `gradient-string` | Gradient colored terminal text |
| `conf` | Persistent user configuration storage |
| `dotenv` | Environment variable management |
| `TypeScript` | Strongly-typed JavaScript |

---

## 📁 Project Structure

```
meow-ai/
├── src/               # TypeScript source files
├── .env.sample        # Sample environment variable file
├── .gitignore         # Git ignored files
├── .prettierrc        # Prettier formatting config
├── .prettierignore    # Files excluded from Prettier
├── package.json       # Project metadata and scripts
├── tsconfig.json      # TypeScript compiler config
└── README.md          # This file
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- An [OpenAI API Key](https://platform.openai.com/api-keys)

### 1. Clone the repository

```bash
git clone https://github.com/NikhilKumarMandal/meow-ai
cd meow-ai
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the sample env file and add your OpenAI API key:

```bash
cp .env.sample .env
```

Open `.env` and fill in your key:

```env
OPENAI_API_KEY="your-openai-api-key-here"
```

### 4. Build the project

Compile the TypeScript source to JavaScript:

```bash
npm run build
```

### 5. Run the app

```bash
npm start
```

---

## 📜 Available Scripts

| Script | Command | Description |
|---|---|---|
| Build | `npm run build` | Compiles TypeScript → `dist/` |
| Start | `npm start` | Runs the compiled app |
| Lint | `npm run lint` | Runs ESLint on `.ts` files |
| Format Check | `npm run format:check` | Checks code formatting with Prettier |
| Format Fix | `npm run format:fix` | Auto-fixes formatting issues |

---

## ⚙️ How It Works

1. **Startup** — The app launches and renders a stylized banner using `figlet` and `gradient-string`.
2. **User Input** — The `@clack/prompts` library displays an interactive terminal prompt for the user to type their message.
3. **AI Request** — The input is sent to the OpenAI API via the Vercel AI SDK (`ai` + `@ai-sdk/openai`).
4. **Response Display** — The AI's response is printed to the terminal with styled formatting using `chalk`.
5. **Configuration** — Any persistent user settings (like the selected model or preferences) are saved locally using `conf`.
6. **Loop** — The conversation continues in a loop until the user exits.

---

## 🔐 Environment Variables

| Variable | Description | Required |
|---|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key | ✅ Yes |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **ISC License**.

---

## 👤 Author

**Nikhil Kumar Mandal**
- GitHub: [@NikhilKumarMandal](https://github.com/NikhilKumarMandal)