const Imap = require("node-imap");
const { simpleParser } = require("mailparser");

const {
  imapUserName,
  imapPassword,
  imapHost,
  imapPort,
} = require("../config/config");

function fetchOtpFromEmail() {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: imapUserName,
      password: imapPassword,
      host: imapHost,
      port: imapPort,
      tls: true,
    });

    imap.once("ready", () => {
      imap.openBox("INBOX", false, () => {
        imap.search([["UNSEEN"], ["FROM", SEARCH_FROM]], (err, results) => {
          if (err || results.length === 0) {
            console.log("No unread emails found from the specified sender.");
            return fetchOtpFromEmail(imap);
          }

          const latestEmailId = results.slice(-1)[0]; // Get the latest email
          const fetch = imap.fetch(latestEmailId, { bodies: "" });

          fetch.on("message", (msg) => {
            msg.on("body", (stream) => {
              simpleParser(stream, (err, parsed) => {
                if (err) return reject(err);

                // Extract OTP from the email body
                const emailBody = parsed.text || "";
                const otpMatch = emailBody.match(
                  /OTP for login is:\s*(\d{4,6})/
                );

                if (otpMatch) {
                  const otp = otpMatch[1];
                  console.log(`Extracted OTP: ${otp}`);
                  resolve(otp);

                  imap.setFlags(latestEmailId, ["\\Seen"], (err) => {
                    if (err) return reject("Failed to mark the email as read.");
                    resolve(otp);
                  });
                } else {
                  reject("OTP not found in the email body.");
                }
              });
            });
          });

          fetch.once("error", (err) => reject(err));
          fetch.once("end", () => imap.end());
        });
      });
    });

    imap.once("error", (err) => reject(err));
    imap.connect();
  });
}

module.exports = fetchOtpFromEmail;
