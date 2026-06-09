const Anthropic = require('@anthropic-ai/sdk');
const { exec } = require('child_process');
const { promisify } = require('util');
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const execAsync = promisify(exec);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const DESCRIPTIONS_FILE = path.join(__dirname, 'project-descriptions.json');

// Promisify readline question
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Wait for a single key after each batch: Enter continues, Escape exits.
function waitForNextBatch() {
  const prompt = 'Press Enter to generate another 20 domains, or Escape to exit...';

  if (!process.stdin.isTTY) {
    return question(`${prompt} `).then(answer => answer.trim().toLowerCase() !== 'escape');
  }

  return new Promise(resolve => {
    const wasRaw = process.stdin.isRaw;

    function cleanup(result) {
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(wasRaw);
      rl.resume();
      process.stdout.write('\n');
      resolve(result);
    }

    function onKeypress(str, key = {}) {
      if (key.ctrl && key.name === 'c') {
        cleanup(false);
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        cleanup(true);
        return;
      }

      if (key.name === 'escape') {
        cleanup(false);
      }
    }

    process.stdout.write(prompt);
    readline.emitKeypressEvents(process.stdin);
    rl.pause();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', onKeypress);
  });
}

// Load saved project descriptions
async function loadDescriptions() {
  try {
    const data = await fs.readFile(DESCRIPTIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist or is invalid, return empty array
    return [];
  }
}

// Save project descriptions
async function saveDescriptions(descriptions) {
  try {
    await fs.writeFile(DESCRIPTIONS_FILE, JSON.stringify(descriptions, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving descriptions:', error.message);
  }
}

// Add a new description if it doesn't already exist
async function addDescription(description) {
  const descriptions = await loadDescriptions();

  // Check if description already exists
  const exists = descriptions.some(d => d.text.toLowerCase() === description.toLowerCase());

  if (!exists) {
    descriptions.push({
      text: description,
      createdAt: new Date().toISOString()
    });
    await saveDescriptions(descriptions);
  }
}

// Get project description from user (existing or new)
async function getProjectDescription() {
  const descriptions = await loadDescriptions();

  console.log('');

  if (descriptions.length > 0) {
    console.log('Saved project descriptions:\n');
    descriptions.forEach((desc, index) => {
      console.log(`${index + 1}. ${desc.text}`);
    });
    console.log(`${descriptions.length + 1}. Enter a new description\n`);

    const choice = await question(`Select an option (1-${descriptions.length + 1}): `);
    const choiceNum = parseInt(choice);

    if (choiceNum >= 1 && choiceNum <= descriptions.length) {
      return descriptions[choiceNum - 1].text;
    }
  }

  // Ask for new description
  const newDescription = await question('Please describe your project (1-2 sentences): ');

  if (newDescription.trim()) {
    await addDescription(newDescription.trim());
  }

  return newDescription.trim();
}

// Generate domain names using Claude
async function generateDomainNames(projectDescription, previousDomains = []) {
  try {
    console.log('\nGenerating domain names...\n');

    let prompt = `Based on this project description: "${projectDescription}"

Generate exactly 20 creative, memorable domain names for this project.
Focus on .com domains that are:
- Short and memorable
- Easy to spell and pronounce
- Relevant to the project
- Professional
- UNIQUE and different from each other`;

    if (previousDomains.length > 0) {
      prompt += `\n\nIMPORTANT: Do NOT include any of these previously suggested domains:\n${previousDomains.slice(-30).join('\n')}`;
    }

    prompt += `\n\nReturn ONLY the domain names, one per line, with the .com extension. No explanations, no numbering, just the domain names.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = message.content[0].text;
    const domains = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && line.includes('.'))
      .map(line => line.toLowerCase())
      .slice(0, 20);

    return domains;
  } catch (error) {
    console.error('Error generating domain names:', error.message);
    return [];
  }
}

// Check if a domain is available using WHOIS
async function checkDomainAvailability(domain) {
  try {
    const { stdout, stderr } = await execAsync(`whois ${domain}`, { timeout: 10000 });
    const output = (stdout + stderr).toLowerCase();

    // Check for indicators that domain is NOT registered (available)
    const availableIndicators = [
      'no match for domain',
      'no match for',
      'not found',
      'no entries found',
      'no data found',
      'domain not found',
      'status: available',
      'not been registered',
      'is available for',
      'available for registration',
      'no information available',
      'domain status: free',
      'no matching record',
      'not registered'
    ];

    const isAvailable = availableIndicators.some(indicator =>
      output.includes(indicator)
    );

    if (isAvailable) {
      return { domain, available: true };
    }

    // If no "available" indicators found and we got output, assume it's registered
    if (output.trim().length > 0) {
      return { domain, available: false };
    }

    // Empty response is uncertain
    return { domain, available: null };
  } catch (error) {
    // If WHOIS query fails, mark as uncertain for manual checking
    return { domain, available: null, error: error.message };
  }
}

// Check multiple domains concurrently with rate limiting
async function checkDomainsBatch(domains) {
  console.log('Checking domain availability...\n');

  const batchSize = 5; // Check 5 at a time to avoid overwhelming WHOIS servers
  const results = [];

  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(domain => checkDomainAvailability(domain))
    );
    results.push(...batchResults);

    // Progress indicator
    process.stdout.write(`Checked ${Math.min(i + batchSize, domains.length)}/${domains.length} domains...\r`);

    // Small delay between batches
    if (i + batchSize < domains.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n');
  return results;
}

// Main application loop
async function main() {
  console.log('=== Domain Name Finder ===\n');
  console.log('This tool uses Claude AI to generate domain names and checks their availability.\n');

  // Get project description (from saved list or new)
  const projectDescription = await getProjectDescription();

  if (!projectDescription) {
    console.log('No description provided. Exiting.');
    rl.close();
    return;
  }

  console.log(`\nUsing project description: "${projectDescription}"\n`);

  let continueGenerating = true;
  const checkedDomains = new Set(); // Track all domains checked in this session

  while (continueGenerating) {
    // Generate domains (passing previously checked domains to avoid duplicates)
    const domains = await generateDomainNames(projectDescription, Array.from(checkedDomains));

    if (domains.length === 0) {
      console.log('Failed to generate domain names. Please try again.');
      break;
    }

    // Filter out duplicates
    const newDomains = domains.filter(domain => !checkedDomains.has(domain));
    const duplicateCount = domains.length - newDomains.length;

    if (duplicateCount > 0) {
      console.log(`Generated ${domains.length} domain names (${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''} removed).`);
    } else {
      console.log(`Generated ${domains.length} domain names.`);
    }

    if (newDomains.length === 0) {
      console.log('All generated domains were duplicates. Try generating again.\n');
      continueGenerating = await waitForNextBatch();
      continue;
    }

    // Add new domains to checked set
    newDomains.forEach(domain => checkedDomains.add(domain));

    // Check availability
    const results = await checkDomainsBatch(newDomains);

    // Show available domains
    const available = results.filter(r => r.available === true);
    const unavailable = results.filter(r => r.available === false);
    const uncertain = results.filter(r => r.available === null);

    console.log('=== Results ===\n');

    if (available.length > 0) {
      console.log('✓ AVAILABLE DOMAINS:');
      available.forEach(r => console.log(`  - ${r.domain}`));
      console.log('');
    } else {
      console.log('No clearly available domains found in this batch.\n');
    }

    if (uncertain.length > 0) {
      console.log('? UNCERTAIN (manual check recommended):');
      uncertain.forEach(r => console.log(`  - ${r.domain}`));
      console.log('');
    }

    if (unavailable.length > 0) {
      console.log('✗ TAKEN DOMAINS:');
      unavailable.forEach(r => console.log(`  - ${r.domain}`));
      console.log('');
    }

    console.log(`Summary: ${available.length} available, ${unavailable.length} taken, ${uncertain.length} uncertain\n`);

    // Ask if user wants to continue
    continueGenerating = await waitForNextBatch();
  }

  console.log('\nThank you for using Domain Name Finder!');
  rl.close();
}

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
  console.error('Please create a .env file with your API key or set it in your environment.');
  process.exit(1);
}

// Run the application
main().catch(error => {
  console.error('Application error:', error);
  rl.close();
  process.exit(1);
});
