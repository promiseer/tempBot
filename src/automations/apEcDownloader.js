const logger = require("../../utils/logger");
const {
  clickButton,
  fillInput,
  dropDownSelector,
  responseValidator,
  getCaptchaText,
  downloadPdf,
  puppeteerInstance,
  elementFinder,
  generatePDF,
  delay,
  mergePDFs,
} = require("../../utils/pupeteer");

// Helper function for navigation error handling
const handleNavigationError = async (fn, ...args) => {
  const maxRetries = 3;
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      if (typeof fn !== "function") {
        throw new Error("Provided argument is not a function");
      }
      return await fn(...args);
    } catch (error) {
      attempts++;
      console.error(`Attempt ${attempts} failed:`, error.message);
      if (attempts >= maxRetries) {
        console.error("Max retries reached:", error.message);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
    }
  }
};

// Search by Document Number
const searchByDocumentNumber = async (
  encumbranceType,
  page,
  docNo,
  docYear,
  sroName,
  multipleSros,
  startDate,
  docNoIdentifier
) => {
  try {
    await page.goto("https://registration.ec.ap.gov.in/ecSearch", {
      waitUntil: "networkidle0",
    });

    await page.waitForSelector("#encumbranceServiceForm");

    // Select 'Document Number' in the dropdown
    await page.select("#typeSelectId", "DocNo");

    // Fill document number and registration year
    await fillInput(
      page,
      '#encumbranceServiceForm input[name="docMemoNo"]',
      docNo
    );
    await fillInput(
      page,
      '#encumbranceServiceForm input[name="yearOfRegistration"]',
      docYear
    );

    // Select SRO using a dropdown
    await dropDownSelector(page, "input.react-select__input", sroName);

    // Get CAPTCHA text and fill it in
    const captchaText = await getCaptchaText(
      page,
      "div.col-lg-3.col-md-3.col-3 span",
      3,
      1000
    );
    await page.type(
      '#encumbranceServiceForm input[name="captchaVal"]',
      captchaText
    );

    // Submit form
    await clickButton(page, '#encumbranceServiceForm button[type="submit"]');
    logger.info("Logged in successfully");

    // Continue to next steps
    // if (encumbranceType == "ENCUMBRANCE_TYPE.DNMS") {
    //   return await handleMultipleSro(
    //     page,
    //     encumbranceType,
    //     multipleSros,
    //     startDate
    //   );
    // }

    await handleSecondForm(page, encumbranceType, multipleSros, startDate);
    await page.waitForNavigation();

    const filePath = await generatePDF(
      page,
      "#__next > div > div:nth-child(2) > div > div.container > div:nth-child(2) > div > table",
      `Public/Downloads/${docNoIdentifier}`
    );

    return filePath;
  } catch (error) {
    logger.error("Error in searchByDocumentNumber:", error.message);
    throw error;
  }
};

const handleMultipleSro = async (
  encumbranceType,
  page,
  sroName,
  multipleSros,
  ownerName,
  startDate,
  docNo,
  docYear,
  surveyNo,
  village,
  houseNo,
  ward,
  block,
  district
) => {
  const tasks = [];

  for (let i = 0; i < multipleSros?.length; i += 2) {
    const sroPair = multipleSros.slice(i, i + 2);
    if (["ENCUMBRANCE_TYPE.DNMS"].includes(encumbranceType)) {
      tasks.push(
        await searchByDocumentNumber(
          encumbranceType,
          page,
          docNo,
          docYear,
          sroName,
          sroPair, // Pass individual SRO from the pair
          startDate,
          `${docNo}-${i}` // Unique identifier for each task
        )
      );
    }
    if (
      [
        "ENCUMBRANCE_TYPE.HNMS",
        "ENCUMBRANCE_TYPE.SHNMS",
        "ENCUMBRANCE_TYPE.SSNMS",
        "ENCUMBRANCE_TYPE.SASNMS",
      ].includes(encumbranceType)
    ) {
      tasks.push(
        await ScrapeByNone(
          encumbranceType,
          page,
          surveyNo,
          village,
          houseNo,
          ward,
          block,
          district,
          sroName,
          sroPair,
          ownerName,
          startDate,
          `${docNo}-${i}` // Unique identifier for each task
        )
      );
    }
  }
  const filePaths = await Promise.all(tasks);
  const filePath = await mergePDFs(filePaths, `Public/Downloads/${docNo}.pdf`);
  return filePath;
};

// Handle the second form submission
const handleSecondForm = async (
  page,
  encumbranceType,
  multipleSros,
  startDate
) => {
  try {
    // Validate response and get property list
    await responseValidator(
      page,
      "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getPropertiesByDocNumAndSroCodeAndRegYear"
    );

    const sroList =
      encumbranceType === "ENCUMBRANCE_TYPE.DNMS" ? multipleSros : [];

    // Click NEXT button after first form submission
    await clickButton(page, "button.btn.btn-primary.btn-sm");
    logger.info("2nd Form submitted successfully!");

    await page.waitForSelector("form");
    await delay(1000);
    await page.type('form input[name="applicantName"]', ".");
    await delay(1000);

    startDate
      ? await page.type('form input[name="periodOfSearchFrom"]', startDate)
      : logger.info("Skipping Date input as it's empty");

    // Get new CAPTCHA text and fill it
    const captchaText = await getCaptchaText(
      page,
      "form div.col-lg-1.col-md-1.col-1 span",
      3,
      1000
    );
    logger.info("3rd CAPTCHA", captchaText);

    errorCaptcha = elementFinder(
      page,
      "#__next > div > div:nth-child(3) > div.MainContent > div > div > div > div > div > form > div.p.row > div.col-lg-3.col-md-3.col-3 > div"
    );
    if (errorCaptcha) {
      logger.info("Captcha error found");
    }
    await page.type('form input[name="captchaVal"]', captchaText);

    // Select MultipleSRO values
    if (sroList.length) {
      await selectSRO(page, sroList);
    }

    // Submit form and proceed to download
    await clickButton(page, 'form button[type="submit"]');
    await clickButton(page, "#selectAllId");
    await clickButton(page, ".btn.btn-primary");
  } catch (error) {
    throw error;
  }
};

// Select the SRO values
const selectSRO = async (page, sroList) => {
  await page.click("div.react-select__control"); // Focus on the dropdown

  for (let sro of sroList.slice(0, 2)) {
    await dropDownSelector(page, "input.react-select__input", sro);
  }
};

const handleSRONames = async (page, selector, sroName) => {
  // Check if sroName is an array
  if (Array.isArray(sroName)) {
    // Iterate over each SRO and call dropDownSelector
    for (let sro of sroName) {
      await dropDownSelector(page, selector, sro); // Handle multiple SROs
      await delay(1000);
    }
  } else {
    // Handle single SRO
    await dropDownSelector(page, selector, sroName);
    await delay(1000);
  }
};

// Search by None (without document number)
const ScrapeByNone = async (
  encumbranceType,
  page,
  surveyNo,
  village,
  houseNo,
  ward,
  block,
  district,
  sroName,
  multipleSros,
  ownerName,
  startDate
) => {
  let filePath;
  try {
    if (
      ["ENCUMBRANCE_TYPE.SNOS", "ENCUMBRANCE_TYPE.SSNMS"].includes(
        encumbranceType
      ) &&
      typeof houseNo === "string" &&
      houseNo?.trim() !== "" &&
      houseNo !== undefined
    ) {
      logger.info("House No  found Skipping for SNOS ");
      return "Public/Downloads/dummy.pdf";
    }

    await page.goto(
      "https://registration.ec.ap.gov.in/ecSearch/EncumbranceSearch",
      { waitUntil: "networkidle0" }
    );

    await page.waitForSelector("form");
    await dropDownSelector(page, ".react-select__input", district); //select district

    await responseValidator(
      page,
      "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getSroList"
    );
    await handleSRONames(
      page,
      "#react-select-3-input",
      [
        "ENCUMBRANCE_TYPE.HNMS",
        "ENCUMBRANCE_TYPE.SHNMS",
        "ENCUMBRANCE_TYPE.SSNMS",
        "ENCUMBRANCE_TYPE.SASNMS",
      ].includes(encumbranceType)
        ? multipleSros
        : sroName
    );

    await fillInput(
      page,
      ".Table_columnInputBox__zkfbO",
      ownerName ? ownerName : "."
    ); //applicant name

    if (
      [
        "ENCUMBRANCE_TYPE.HNOS",
        "ENCUMBRANCE_TYPE.HNMS",
        "ENCUMBRANCE_TYPE.SHNOS",
        "ENCUMBRANCE_TYPE.SHNMS",
        "ENCUMBRANCE_TYPE.SNOS",
        "ENCUMBRANCE_TYPE.SSNMS",
      ].includes(encumbranceType)
    ) {
      await fillBuildingDetails(
        page,
        sroName,
        surveyNo,
        houseNo,
        ward,
        block,
        village,
        startDate,
        encumbranceType
      ); //@todo: add alias if required
    }

    if (
      ["ENCUMBRANCE_TYPE.SASNMS", "ENCUMBRANCE_TYPE.ASNOS"].includes(
        encumbranceType
      )
    ) {
      await fillSurveyDetails(
        page,
        surveyNo,
        village,
        encumbranceType,
        startDate
      );
    }

    await delay(1000);
    await submitAndValidateCaptcha(page);

    const docs = await responseValidator(
      page,
      "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getLinkDocumentsByPropertyDetails"
    );

    if (!Object.entries(docs.data.documentList).length) {
      filePath = "Public/Downloads/no-documents-found.png";
      await page.screenshot({
        path: filePath,
      });
      logger.error("Documents not found on search data.");
      return filePath;
    }

    await clickButton(page, "#selectAllId");
    await clickButton(page, "button.btn.btn-primary");
    await page.waitForNavigation();

    filePath = await generatePDF(
      page,
      "#__next > div > div:nth-child(2) > div > div.container > div:nth-child(2) > div > table",
      `Public/Downloads/AP-EncumbranceCertificate-document-without-docNumber`
    );

    return filePath;
  } catch (error) {
    throw error;
  }
};

// Fill the building details form
const fillBuildingDetails = async (
  page,
  sroName,
  surveyNo,
  houseNo,
  ward,
  block,
  village,
  startDate,
  encumbranceType
) => {
  await fillInput(
    page,
    'input[name="houseNo"]',
    ["ENCUMBRANCE_TYPE.SNOS", "ENCUMBRANCE_TYPE.SSNMS"].includes(
      encumbranceType
    )
      ? houseNo.split("/")[0]
      : houseNo
  );

  await fillInput(page, 'input[name="inSurveyNo"]', surveyNo);
  ward
    ? await fillInput(page, 'input[name="wardNo"]', ward)
    : logger.info("Skipping ward no input as it's empty");
  block
    ? await fillInput(page, 'input[name="blockNo"]', block)
    : logger.info("Skipping block no input as it's empty");
  await fillInput(page, 'input[name="villageOrCity"]', village);
  sroName
    ? await fillInput(page, 'input[name="alias"]', sroName)
    : logger.info("Skipping Alias input as it's empty");

  startDate
    ? await page.type('input[name="periodOfSearchFrom"]', startDate)
    : logger.info("Skipping Date input as it's empty");
};

// Fill the survey details form for Sites or Agricultural Lands
const fillSurveyDetails = async (
  page,
  survey,
  village,
  encumbranceType,
  startDate
) => {
  await clickButton(page, '.form-check-input[value="BS"]');
  await clickButton(page, '.form-check-input[value="SAL"]');
  ["ENCUMBRANCE_TYPE.SASNMS"].includes(encumbranceType)
    ? await fillInput(page, 'input[name="inSurveyNo"]', survey.split("/")[0])
    : await fillInput(page, 'input[name="inSurveyNo"]', survey);
  await fillInput(page, 'input[name="revenueVillage"]', village);
  startDate
    ? await page.type('input[name="periodOfSearchFrom"]', startDate)
    : logger.info("Skipping Date input as it's empty");
};

// Submit form and fill CAPTCHA
const submitAndValidateCaptcha = async (page) => {
  const captchaText = await getCaptchaText(
    page,
    "div.col-lg-1.col-md-1.col-1 span",
    3,
    1000
  );
  await fillInput(page, 'input[name="captchaVal"]', captchaText);
  await clickButton(page, 'button[type="submit"].btn-primary');
};

// Main function to trigger the script
const apEcDownloader = async ({
  docNo,
  docYear,
  sroName,
  multipleSros,
  ownerName,
  houseNo,
  surveyNo,
  village,
  ward,
  block,
  district,
  encumbranceType,
  startDate,
}) => {
  const browser = await puppeteerInstance();
  const page = await browser.newPage();
  logger.info(":: Automation Started");
  let filePath;
  try {
    switch (encumbranceType) {
      case "ENCUMBRANCE_TYPE.DNOS":
        filePath = await searchByDocumentNumber(
          encumbranceType,
          page,
          docNo,
          docYear,
          sroName,
          multipleSros,
          startDate,
          docNo //docIdentifier
        );
        await page.close();

        break;

      case "ENCUMBRANCE_TYPE.DNMS":
        filePath = await handleMultipleSro(
          encumbranceType,
          page,
          sroName,
          multipleSros,
          ownerName,
          startDate,
          docNo,
          docYear
        );
        await page.close();

        break;
      case "ENCUMBRANCE_TYPE.HNOS":
      case "ENCUMBRANCE_TYPE.SHNOS":
      case "ENCUMBRANCE_TYPE.SNOS":
      case "ENCUMBRANCE_TYPE.ASNOS":
        filePath = await ScrapeByNone(
          encumbranceType,
          page,
          surveyNo,
          village,
          houseNo,
          ward,
          block,
          district,
          sroName,
          multipleSros,
          ownerName,
          startDate
        );
        await page.close();

        break;

      case "ENCUMBRANCE_TYPE.HNMS":
      case "ENCUMBRANCE_TYPE.SHNMS":
      case "ENCUMBRANCE_TYPE.SSNMS":
      case "ENCUMBRANCE_TYPE.SASNMS":
        filePath = await handleMultipleSro(
          encumbranceType,
          page,
          sroName,
          multipleSros,
          ownerName,
          startDate,
          docNo,
          docYear,
          surveyNo,
          village,
          houseNo,
          ward,
          block,
          district
        );
        await page.close();

        break;

      default:
        logger.info("Invalid encumbranceType! ");
        break;
    }

    await browser.close();
    return { status: "ok", filePath };
  } catch (error) {
    logger.info(error.message);

    throw new Error(error.message);
  } finally {
    await browser.close();
  }
};

module.exports = apEcDownloader;
