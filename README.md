# OG COMPLEX Clone

Clean React/Vite reconstruction of the supplied OG COMPLEX inspect dump.

## Run

```bash
npm install
copy .env.example .env.local
npm run dev
```

Then open the Vite URL.

## Firebase

Put your own Firebase **Web App** configuration in `.env.local`.

Use Firebase Console -> Project settings -> Your apps -> Web app.

Do NOT put a Firebase service-account private key or database secret into frontend code.

The UI is wired for the user's own Firebase project and stores the saved panel list locally in the browser.

The APK/ZIP control is intentionally UI-compatible only; it does not extract credentials, API keys, database secrets, or payment-card security data.
