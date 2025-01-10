const Imap = require("node-imap");
const { simpleParser } = require("mailparser");

const {
  imapUserName,
  imapPassword,
  imapHost,
  imapPort,
  searchFrom,
} = require("../config/config");
const { delay } = require("./pupeteer");
const fetchOtpFromEmail = async () => {
  const imap = new Imap({
    user: imapUserName,
    password: imapPassword,
    host: imapHost,
    port: imapPort,
    tls: true,
  });

  try {
    // Connect to the IMAP server
    await new Promise((resolve, reject) => {
      imap.once("error", reject);
      imap.once("ready", resolve);
      imap.connect();
    });

    // Open the inbox
    await new Promise((resolve, reject) => {
      imap.openBox("INBOX", false, (err) => {
        if (err) return reject("Failed to open inbox: " + err);
        resolve();
      });
    });

    // Search for unseen emails from the specific sender
    const results = await new Promise((resolve, reject) => {
      imap.search([["UNSEEN"], ["FROM", searchFrom]], (err, results) => {
        console.log("results", results);

        if (err || results.length === 0) {
          console.log("No unread emails found from the specified sender.");
          return reject("No emails found.");
        }
        resolve(results);
      });
    });

    // Get the latest email
    const latestEmailId = results.slice(-1)[0];

    // Fetch the email
    const otp = await new Promise((resolve, reject) => {
      const fetch = imap.fetch(latestEmailId, { bodies: "" });

      fetch.on("message", (msg) => {
        msg.on("body", (stream) => {
          simpleParser(stream, (err, parsed) => {
            if (err) return reject("Error parsing email: " + err);

            // Extract OTP from the email body
            const emailBody = parsed.text || "";
            const otpMatch = emailBody.match(/OTP for login is:\s*(\d{4,6})/);

            if (otpMatch) {
              const otp = otpMatch[1];
              console.log(`Extracted OTP: ${otp}`);

              imap.setFlags(latestEmailId, ["\\Seen"], (err) => {
                if (err)
                  return reject("Failed to mark the email as read: " + err);
              });
              resolve(otp);
            } else {
              reject("OTP not found in the email body.");
            }
          });
        });
      });

      fetch.once("error", (err) => reject("Error fetching email: " + err));
      fetch.once("end", () => imap.end());
    });

    // Return the extracted OTP
    return otp;
  } catch (err) {
    if (err === "No emails found.") {
      console.log("Retrying after delay...");
      await delay(2000); // Wait for 5 seconds before retrying
      return fetchOtpFromEmail(); // Recursively call the function again
    }
    throw err; // Rethrow to handle any other errors in the async chain
  } finally {
    imap.end(); // Close the connection when done
  }
};

module.exports = fetchOtpFromEmail;
