# Streamlit Cloud Configuration

This folder contains configuration for Streamlit Cloud deployment.

## Files Created Automatically

When you deploy to Streamlit Cloud, these files are created:
- `config.toml` - Server configuration
- `credentials.toml` - (Not used, secrets are in dashboard)

## Adding Secrets

1. Go to your app dashboard on Streamlit Cloud
2. Click Settings → Secrets
3. Add your secrets in TOML format:

```toml
OPENAI_API_KEY = "sk-your-key-here"

# Firebase configuration (if using)
[firebase]
type = "service_account"
project_id = "ikamba-1c669"
private_key_id = "your-private-key-id"
private_key = "-----BEGIN PRIVATE KEY-----\nyour-private-key-here\n-----END PRIVATE KEY-----\n"
client_email = "firebase-adminsdk-xxxxx@ikamba-1c669.iam.gserviceaccount.com"
client_id = "your-client-id"
auth_uri = "https://accounts.google.com/o/oauth2/auth"
token_uri = "https://oauth2.googleapis.com/token"
auth_provider_x509_cert_url = "https://www.googleapis.com/oauth2/v1/certs"
client_x509_cert_url = "your-cert-url"
```

## Configuration Options

You can customize the app by adding to `.streamlit/config.toml`:

```toml
[theme]
base = "dark"
primaryColor = "#10a37f"
backgroundColor = "#343541"
secondaryBackgroundColor = "#444654"
textColor = "#ececf1"

[server]
headless = true
port = 8501
```
