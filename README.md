# Domain Name Finder

An intelligent domain name generator and availability checker powered by Claude AI. This tool helps you brainstorm creative domain names for your project and instantly checks their availability using WHOIS.

## Features

- **AI-Powered Generation**: Uses Claude AI to generate 20 creative, relevant domain names based on your project description
- **Fast Availability Checking**: Queries WHOIS databases to check domain registration status
- **Batch Processing**: Checks multiple domains efficiently with rate limiting
- **Interactive Interface**: Simple command-line interface for easy use
- **Continuous Generation**: Generate multiple batches of domains until you find the perfect one
- **Saved Project Descriptions**: Automatically saves your project descriptions for reuse in future sessions

## Prerequisites

- Node.js (v14 or higher)
- An Anthropic API key ([get one here](https://console.anthropic.com/))
- The `whois` command-line tool (usually pre-installed on Linux/macOS, install via `apt install whois` or `brew install whois`)

## Installation

1. Clone or navigate to this directory:
```bash
cd domain-name-finder
```

2. Install dependencies:
```bash
npm install
```

3. Set up your environment:
```bash
cp .env.example .env
```

4. Edit `.env` and add your Anthropic API key:
```
ANTHROPIC_API_KEY=your_actual_api_key_here
```

## Usage

Run the application:
```bash
node index.js
```

The application will:
1. Show you any previously saved project descriptions or ask for a new one
2. Save your project description for future use (if new)
3. Generate 20 domain names using Claude AI
4. Check each domain's availability via WHOIS
5. Display:
   - ✓ Available domains (ready to register)
   - ? Uncertain domains (may need manual verification)
   - ✗ Taken domains (already registered)
   - Summary of results
6. Offer to generate another batch of 20 domains or exit

### Example Session (First Time)

```
=== Domain Name Finder ===

This tool uses Claude AI to generate domain names and checks their availability.

Please describe your project (1-2 sentences): A mobile app for tracking daily water intake and hydration goals

Using project description: "A mobile app for tracking daily water intake and hydration goals"

Generating domain names...

Generated 20 domain names.
Checking domain availability...

=== Results ===

✓ AVAILABLE DOMAINS:
  - hydratrack.com
  - watergoal.com
  - dailyhydrate.com

? UNCERTAIN (manual check recommended):
  - aquareminder.com

✗ TAKEN DOMAINS:
  - watertracker.com
  - hydrationapp.com
  - drinkwater.com
  ... (12 more)

Summary: 3 available, 15 taken, 2 uncertain

Generate another 20 domains? (yes/no):
```

### Example Session (With Saved Descriptions)

```
=== Domain Name Finder ===

This tool uses Claude AI to generate domain names and checks their availability.

Saved project descriptions:

1. A mobile app for tracking daily water intake and hydration goals
2. An AI-powered recipe recommendation platform for home cooks
3. Enter a new description

Select an option (1-3): 1

Using project description: "A mobile app for tracking daily water intake and hydration goals"

Generating domain names...
```

## How It Works

1. **Domain Generation**: The app sends your project description to Claude AI with specific instructions to generate creative, memorable .com domain names

2. **Availability Checking**: Each domain is checked using the system `whois` command. The app:
   - Processes domains in batches of 5 to avoid overwhelming WHOIS servers
   - Looks for common indicators of availability (e.g., "No match for domain", "not found")
   - Marks uncertain results for manual verification

3. **Results Classification**:
   - **Available**: Domain appears unregistered and ready to purchase
   - **Taken**: Domain is currently registered
   - **Uncertain**: WHOIS query was inconclusive (network issues, rate limiting, etc.)

## Notes

- **Saved Descriptions**: Project descriptions are automatically saved to `project-descriptions.json` in the app directory. You can reuse them in future sessions or manually edit/delete this file.
- WHOIS queries can sometimes be rate-limited by registrars
- "Uncertain" results should be manually verified on a domain registrar's website
- The app focuses on .com domains by default, but Claude may occasionally suggest other TLDs
- Processing time varies based on WHOIS server response times (typically 30-60 seconds for 20 domains)

## Troubleshooting

**Error: ANTHROPIC_API_KEY environment variable is not set**
- Make sure you've created a `.env` file with your API key

**WHOIS timeouts or errors**
- This is normal for some domains/registrars
- Domains marked as "uncertain" should be checked manually

**No available domains found**
- Try generating another batch with a different focus
- Consider modifying your project description to explore different naming angles

## License

ISC
