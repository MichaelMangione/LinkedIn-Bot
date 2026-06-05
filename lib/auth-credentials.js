/**
 * LinkedIn sign-in credentials.
 * Load from environment so secrets never need to live in the repo.
 */
const LINKEDIN_EMAIL = process.env.LINKEDIN_EMAIL;
const LINKEDIN_PASSWORD = process.env.LINKEDIN_PASSWORD;

if (!LINKEDIN_EMAIL || !LINKEDIN_PASSWORD) {
  throw new Error(
    "Missing LinkedIn credentials. Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD in your environment or .env file."
  );
}

module.exports = {
  LINKEDIN_EMAIL,
  LINKEDIN_PASSWORD,
};
