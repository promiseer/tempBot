const logger = require("../../utils/logger");
const {
  puppeteerInstance,
  clickButton,
  getCaptchaTextFromImage,
} = require("../../utils/pupeteer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const OpenAI = require("openai");
const pdf = require("pdf-parse");
const { jsPDF } = require("jspdf");
require("jspdf-autotable");

const ASSISTANT_ID = process.env.ASSISTANT_ID;
const API_KEY = process.env.OPEN_AI_KEY;

const openai = new OpenAI({
  apiKey: API_KEY,
});

async function processPDF(dataBuffer) {
  const SAFE_CHAR_LIMIT = 200000;
  const MAX_ITEMS_PER_BATCH = 10;
  const THREAD_LIMIT = 50; // Maximum number of threads allowed

  let activeThreads = 0;
  const results = [];

  const isValidJSON = (text) => {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  };

  const sendBatchToThread = async (batch, threadIndex) => {
    while (activeThreads >= THREAD_LIMIT) {
      logger.info(`Thread limit of ${THREAD_LIMIT} reached. Waiting...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    activeThreads++;
    try {
      const thread = await openai.beta.threads.create();
      logger.info(`Thread ${threadIndex} created.`);

      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: JSON.stringify({ entries: batch }),
      });

      await openai.beta.threads.runs.createAndPoll(thread.id, {
        assistant_id: ASSISTANT_ID,
      });

      const messages = await openai.beta.threads.messages.list(thread.id, {
        limit: 1,
      });

      const assistantMessage = messages.data.find(
        (message) => message.role === "assistant"
      );

      const response = assistantMessage
        ? assistantMessage.content
            .map((content) =>
              content.type === "text" && "text" in content
                ? content.text.value
                : ""
            )
            .join(" ")
        : "";

      if (response && isValidJSON(response)) {
        return JSON.parse(response).entries || [];
      } else {
        logger.error(
          `Invalid JSON response in Thread ${threadIndex}: ${response}`
        );
        return [];
      }
    } catch (error) {
      logger.error(`Error in Thread ${threadIndex}:`, error);
      return [];
    } finally {
      activeThreads--;
    }
  };

  try {
    const data = await pdf(dataBuffer);
    const text = data.text;

    const commonTextStart = text.indexOf("Sr.");
    const disclaimerIndex = text.indexOf("Disclaimer:");

    if (commonTextStart === -1 || disclaimerIndex === -1) {
      logger.error("Failed to identify the common text or disclaimer section.");
      return;
    }

    const firstEntryStart =
      text.match(/\d+\/\d{4}\s+\d{2}-\w{3}-\d{4}/)?.index || -1;
    const commonText = text.slice(commonTextStart, firstEntryStart).trim();

    let start = firstEntryStart;
    const entries = [];
    const entryPattern = /\d+\/\d{4}\s+\d{2}-\w{3}-\d{4}/g;
    let match;

    while ((match = entryPattern.exec(text)) !== null) {
      const end = match.index;
      if (start !== end) {
        const entry = text.slice(start, end).trim();
        entries.push(`${commonText}\n${entry}`);
      }
      start = end;
    }

    const lastEntry = text.slice(start, disclaimerIndex).trim();
    entries.push(`${commonText}\n${lastEntry}`);

    const batches = [];
    let batch = [];
    let currentBatchLength = 0;

    entries.forEach((entry, index) => {
      const entryString = JSON.stringify(entry, null, 2);

      if (
        currentBatchLength + entryString.length > SAFE_CHAR_LIMIT ||
        batch.length >= MAX_ITEMS_PER_BATCH
      ) {
        batches.push(batch);
        batch = [];
        currentBatchLength = 0;
      }

      batch.push(entry);
      currentBatchLength += entryString.length;

      if (index === entries.length - 1 && batch.length > 0) {
        batches.push(batch);
      }
    });

    const promises = batches.map((batch, index) =>
      sendBatchToThread(batch, index + 1)
    );

    const threadResults = await Promise.all(promises);
    results.push(...threadResults.flat());

    return { entries: results };
  } catch (error) {
    logger.error("Error processing PDF:", error);
    return { entries: [] };
  }
}

/**
 * Generates a structured PDF table with consistent formatting from JSON data.
 * @param {Object} data - The JSON data containing `entries`.
 * @param {string} outputFilePath - The path of the output PDF file.
 */
function generatePDF(data, outputFilePath) {
  if (!data.entries || !Array.isArray(data.entries)) {
    logger.error("Invalid data format. Expected an array of entries.");
    return;
  }

  const doc = new jsPDF("l", "mm", "a4"); // Landscape orientation
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const availableWidth = pageWidth - margin;

  const headers = [
    { content: "Sl. No", styles: { halign: "center" } },
    { content: "Description", styles: { halign: "left" } },
    { content: "Dates", styles: { halign: "left" } },
    { content: "Deed Value", styles: { halign: "left" } },
    { content: "Parties", styles: { halign: "left" } },
    { content: "Identifiers", styles: { halign: "left" } },
  ];

  const columnWidths = {
    0: availableWidth * 0.05,
    1: availableWidth * 0.25,
    2: availableWidth * 0.15,
    3: availableWidth * 0.15,
    4: availableWidth * 0.2,
    5: availableWidth * 0.2,
  };

  const rows = data.entries.map((entry) => [
    { content: entry.slNo, styles: { halign: "center" } },
    { content: entry.description, styles: { halign: "left" } },
    { content: entry.dates, styles: { halign: "left" } },
    { content: entry.deedValue, styles: { halign: "left" } },
    { content: entry.parties, styles: { halign: "left" } },
    { content: entry.identifiers, styles: { halign: "left" } },
  ]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Property Transaction Details", pageWidth / 2, 15, {
    align: "center",
  });

  doc.autoTable({
    head: [headers],
    body: rows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      halign: "left",
      valign: "top",
      cellPadding: 5,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [74, 140, 129],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
    },
    columnStyles: columnWidths,
    margin: { top: 25, left: 10, right: 10 },
    pageBreak: "auto",
    showHead: "everyPage",
  });

  const pdfData = doc.output("arraybuffer");

  // Write the PDF data to the specified output file path
  fs.writeFileSync(outputFilePath, Buffer.from(pdfData));

  logger.info(`PDF generated and saved to ${outputFilePath}`);
}

// Helper function to ensure directory exists
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Helper function to save the PDF file
const savePdfToFile = async (pdfUrl, fileName) => {
  try {
    const dirPath = path.resolve(__dirname, "../../Public/Downloads");

    // Ensure that the directory exists
    ensureDirectoryExists(dirPath);

    // Construct the full file path
    const filePath = path.join(dirPath, `${fileName}.pdf`);

    // Download the PDF using axios
    const response = await axios.get(pdfUrl, { responseType: "arraybuffer" });
    const dataBuffer = response.data;

    const data = await processPDF(dataBuffer);

    if (!data || !data.entries || data.entries.length === 0) {
      logger.error("No data extracted from the PDF.");
      return;
    }

    generatePDF(data, filePath);

    logger.info(`Processed PDF saved to ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error(`Error processing and saving PDF: ${error.message}`);
    throw error;
  }
};

// Helper function to select an option by visible text in a dropdown
const selectDropdownOption = async (page, selector, text) => {
  try {
    await page.waitForSelector(selector, { timeout: 10000 }); // Wait for the dropdown to appear
    const optionFound = await page.evaluate(
      (selector, text) => {
        const select = document.querySelector(selector);
        const options = Array.from(select.options);
        const option = options.find((opt) => opt.textContent.trim() === text);
        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
        return false;
      },
      selector,
      text
    );
    if (!optionFound) {
      throw new Error(
        `Option with text "${text}" not found for selector "${selector}"`
      );
    }
  } catch (error) {
    logger.error(
      `Error selecting option in dropdown "${selector}": ${error.message}`
    );
    throw error;
  }
};

// Helper function to handle CAPTCHA
const handleCaptcha = async (page) => {
  try {
    // Get CAPTCHA text using the same utility from AP code
    const captchaData = await getCaptchaTextFromImage(
      page,
      "#captcha",
      3,
      1000
    );

    // Fill CAPTCHA input field with id #txt_Captcha
    await page.type("#txt_Captcha", captchaData.captchaText);
    logger.info("Captcha solved and entered.");

    return captchaData.imagePath;
  } catch (error) {
    logger.error("Failed to solve captcha.");
    throw error;
  }
};

// Helper function to click "Search/View EC" li element and handle the process after it
const clickSearchViewEC = async (page, sroName, docNo, docYear) => {
  try {
    const found = await page.evaluate(() => {
      const element = Array.from(document.querySelectorAll("li, li span")).find(
        (el) => el.textContent.includes("Search/View EC")
      );

      if (element) {
        element.click();
        return true;
      }
      return false;
    });

    if (found) {
      logger.info(
        "Clicked 'Search/View EC' link, waiting for content to load..."
      );

      // Step 1: Wait for <h2> with class 'sub-heading' and text 'Search Encumbrance Certificate'
      await page.waitForFunction(
        () => {
          const heading = document.querySelector("h2.sub-heading");
          return (
            heading &&
            heading.textContent.trim() === "Search Encumbrance Certificate"
          );
        },
        { timeout: 60000 }
      );
      logger.info("Found the 'Search Encumbrance Certificate' subheading.");

      // Step 2: Click the radio input with id 'DOC_WISE'
      const radioClicked = await page.evaluate(() => {
        const radio = document.querySelector('input[id="DOC_WISE"]');
        if (radio) {
          radio.click();
          return true;
        }
        return false;
      });

      if (radioClicked) {
        logger.info(
          "Clicked the 'DOC_WISE' radio button, waiting for page to re-render..."
        );

        // Step 3: Wait for the 'txt_DocumentNo' element to appear
        await page.waitForSelector("#txt_DocumentNo", { timeout: 60000 });
        logger.info("Document Number input appeared.");

        // Step 4: Fill in the form fields
        await selectDropdownOption(page, "#cmb_SroName", sroName); // Select SRO name
        await page.type("#txt_DocumentNo", docNo); // Fill Document Number
        await selectDropdownOption(page, "#cmb_Year", docYear); // Select Year
        await selectDropdownOption(page, "#cmb_doc_type", "Regular Document"); // Select Document Type

        logger.info("Form filled successfully. Handling captcha...");

        // Step 5: Solve captcha
        const captchaImagePath = await handleCaptcha(page);

        // Step 6: Click the search button
        await clickButton(page, "#btn_SearchDoc");
        logger.info(
          "Clicked the 'Search' button. Waiting for page to re-render..."
        );

        // Step 7: Wait for the element with onClick='generatePdf();' to appear
        const searchResult = await Promise.race([
          page
            .waitForFunction(
              () => {
                return Array.from(document.querySelectorAll("a[onClick]")).some(
                  (el) => el.getAttribute("onClick").includes("generatePdf")
                );
              },
              { timeout: 60000 }
            )
            .then(() => "generatePdf"),

          page
            .waitForFunction(
              () => {
                return document.body.innerText.includes(
                  "No Documents registered"
                );
              },
              { timeout: 60000 }
            )
            .then(() => "noDocuments"),
        ]);

        if (searchResult === "noDocuments") {
          logger.warn(
            "No documents registered for the provided search parameters."
          );
          if (captchaImagePath) {
            fs.unlink(captchaImagePath, (err) => {
              if (err) {
                console.error(`Failed to delete captcha image: ${err.message}`);
              } else {
                console.log(`Deleted captcha image: ${captchaImagePath}`);
              }
            });
          }
          return;
        }
        logger.info("Element with 'generatePdf();' onClick handler appeared.");

        // Step 8: Click the element to generate the PDF
        await page.evaluate(() => {
          const element = Array.from(
            document.querySelectorAll("a[onClick]")
          ).find((el) => el.getAttribute("onClick").includes("generatePdf"));
          if (element) {
            element.click();
          } else {
            throw new Error(
              "Element with 'generatePdf();' onClick handler not found."
            );
          }
        });
        logger.info(
          "Clicked the element to generate PDF. Waiting for page to re-render..."
        );

        if (captchaImagePath) {
          fs.unlink(captchaImagePath, (err) => {
            if (err) {
              console.error(`Failed to delete captcha image: ${err.message}`);
            } else {
              console.log(`Deleted captcha image: ${captchaImagePath}`);
            }
          });
        }

        // Step 9: Wait for the 'Click here' link to appear
        await page.waitForSelector(
          'a[target="_blank"] span[style*="color: red"]',
          { timeout: 60000 }
        );
        logger.info("'Click here' link appeared.");

        // Step 10: Get the href attribute of the link
        const pdfLinkHref = await page.evaluate(() => {
          const span = Array.from(
            document.querySelectorAll(
              'a[target="_blank"] span[style*="color: red"]'
            )
          ).find((el) => el.textContent.includes("Click here"));
          if (span && span.parentElement) {
            return span.parentElement.getAttribute("href");
          }
          return null;
        });

        if (!pdfLinkHref) {
          throw new Error("PDF download link not found.");
        }

        // Step 11: Construct the full URL for the PDF
        const pdfUrl = new URL(pdfLinkHref, page.url()).href;
        logger.info(`PDF URL constructed: ${pdfUrl}`);

        // Step 12: Download and save the PDF
        logger.info("Downloading PDF...");
        await savePdfToFile(pdfUrl, "tn-encumbrance-certificate");
      } else {
        logger.error("'DOC_WISE' radio input not found.");
      }
    } else {
      logger.error("'Search/View EC' element not found.");
    }
  } catch (error) {
    logger.error("Error in clickSearchViewEC function.");
    logger.error(`Error message: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    throw error;
  }
};

// Main function to navigate to Search/View EC and save the PDF
const tnEcDownloader = async ({
  docNo,
  docYear,
  sroName,
  State,
  ownerName,
  houseNo,
  surveyNo,
  village,
  ward,
  block,
  district,
}) => {
  const browser = await puppeteerInstance();
  const page = await browser.newPage();

  try {
    // Step 1: Go to the Tamil Nadu registration portal
    logger.info("Navigating to Tamil Nadu registration portal...");
    await page.goto("https://tnreginet.gov.in/portal/", {
      waitUntil: "networkidle0",
    });

    // Step 2: Check if the content inside #fontSelection contains the word 'English'
    const fontSelectionContent = await page.$eval(
      "#fontSelection",
      (el) => el.textContent
    );

    if (fontSelectionContent.includes("English")) {
      logger.info(
        "The 'fontSelection' element contains 'English', clicking it..."
      );

      // Step 3: Click the a element with id="fontSelection"
      await clickButton(page, "#fontSelection");

      // Step 4: Wait for the new page to load completely
      await page.waitForNavigation({ waitUntil: "networkidle0" });

      // Step 5: Click the "Search/View EC" li element
      await clickSearchViewEC(page, sroName, docNo, docYear);
    } else {
      logger.info(
        "The 'fontSelection' element does not contain 'English', skipping the click."
      );
    }
  } catch (error) {
    logger.error("Error in tnEcDownloader function.");
    logger.error(`Error message: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
  } finally {
    await browser.close();
  }
};

module.exports = tnEcDownloader;
