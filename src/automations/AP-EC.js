const {
  clickButton,
  fillInput,
  dropDownSelector,
  responseValidator,
  getCaptchaText,
  downloadPdf,
  puppeteerInstance,
} = require("../../common/pupeteer");

// Helper function for navigation error handling
const handleNavigationError = async (fn, ...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.message.includes("Navigation timeout of")) {
      console.error(
        "ERROR TimeoutError: Navigation timeout of 30000 ms exceeded, retrying..."
      );
      return fn(...args); // Retry on timeout
    }
    if (error.message.includes("ERR_NAME_NOT_RESOLVED")) {
      console.error("ERROR: Check your internet connection.");
      process.exit(1); // Exit on connection issue
    }
    console.error("ERROR: ", error.message);
    throw error;
  }
};

// Search by Document Number
const searchByDocumentNumber = async (
  page,
  url,
  documentNumber,
  yearOfRegistration,
  registeredSRO
) => {
  try {
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForSelector("#encumbranceServiceForm");

    // Select 'Document Number' in the dropdown
    await page.select("#typeSelectId", "DocNo");

    // Fill document number and registration year
    await fillInput(
      page,
      '#encumbranceServiceForm input[name="docMemoNo"]',
      documentNumber
    );
    await fillInput(
      page,
      '#encumbranceServiceForm input[name="yearOfRegistration"]',
      yearOfRegistration
    );

    // Select SRO using a dropdown
    await dropDownSelector(page, "input.react-select__input", registeredSRO);

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
    console.log("Logged in successfully");

    // Validate response and get property list
    const propertyList = await responseValidator(
      page,
      "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getPropertiesByDocNumAndSroCodeAndRegYear"
    );
    const sroList = propertyList.data.drSroList.map((item) => item.srname);

    // Continue to next steps
    await handleSecondForm(page, sroList);
  } catch (error) {
    return handleNavigationError(
      searchByDocumentNumber,
      page,
      url,
      documentNumber,
      yearOfRegistration,
      registeredSRO
    );
  }
};

// Handle the second form submission
const handleSecondForm = async (page, sroList) => {
  // Click NEXT button after first form submission
  await clickButton(page, "button.btn.btn-primary.btn-sm");
  console.log("2nd Form submitted successfully!");

  await page.waitForSelector("form");
  await page.type('form input[name="applicantName"]', ".");

  // Get new CAPTCHA text and fill it
  const captchaText = await getCaptchaText(
    page,
    "form div.col-lg-1.col-md-1.col-1 span",
    3,
    1000
  );
  console.log("3rd CAPTCHA", captchaText);
  await page.type('form input[name="captchaVal"]', captchaText);

  // Select SRO values
  await selectSRO(page, sroList);

  // Submit form and proceed to download
  await clickButton(page, 'form button[type="submit"]');
  await page.waitForSelector("#selectAllId");
  await page.click("#selectAllId");
  await page.click(".btn.btn-primary");

  await page.waitForNavigation();
  
  await downloadPdf(page, "Downloads/AP-EncumbranceCertificate-document-by-doc");
  await page.close();
};

// Select the SRO values
const selectSRO = async (page, sroList) => {
  const selectedSROValue = ["PEDAGANTYADA(317)", "MADURAWADA(315)"];
  await page.click("div.react-select__control"); // Focus on the dropdown

  for (let sro of selectedSROValue) {
    await page.type("input.react-select__input", sro);
    await page.keyboard.press("Enter"); // Select each SRO option
  }
  console.log("Selected SRO values:", selectedSROValue);
};

// Search by None (without document number)
const ScrapeByNone = async (page, url, searchByBuildingDetails = false) => {
  try {
    await page.goto(url, { waitUntil: "networkidle0" });

    await page.waitForSelector("form");
    await dropDownSelector(page, ".react-select__input", "EAST GODAVARI");
    await page.waitForResponse(
      (response) =>
        response.url() ===
          "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getSroList" &&
        response.status() === 200
    );
    await dropDownSelector(page, "#react-select-3-input", "SEETHANAGARAM");
    await fillInput(page, ".Table_columnInputBox__zkfbO", ".");

    if (searchByBuildingDetails) {
      await fillBuildingDetails(page);
    } else {
      await fillSurveyDetails(page);
    }

    await submitAndValidateCaptcha(page);

    const docs = await responseValidator(
      page,
      "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getLinkDocumentsByPropertyDetails"
    );

    if (!Object.entries(docs.data.documentList).length) {
      await page.screenshot({ path: "no-documents-found.png" });
      throw new Error("Documents not found on search data.");
    }

    await clickButton(page, "#selectAllId");
    await clickButton(page, "button.btn.btn-primary");
    await page.waitForNavigation();

    await downloadPdf(page, "Downloads/AP-EncumbranceCertificate-document");
    await page.close();
  } catch (error) {
    return handleNavigationError(
      ScrapeByNone,
      page,
      url,
      searchByBuildingDetails
    );
  }
};

// Fill the building details form
const fillBuildingDetails = async (page) => {
  await fillInput(page, 'input[name="inSurveyNo"]', "55/1E");
  await fillInput(page, 'input[name="houseNo"]', "11-52/3");
  await fillInput(page, 'input[name="villageOrCity"]', "Raghudevpuram");
  await fillInput(page, 'input[name="alias"]', "SEETHANAGARAM");
};

// Fill the survey details form
const fillSurveyDetails = async (page) => {
  await clickButton(page, '.form-check-input[value="BS"]');
  await clickButton(page, '.form-check-input[value="SAL"]');
  await fillInput(page, 'input[name="inSurveyNo"]', "55/1E");
  await fillInput(page, 'input[name="revenueVillage"]', "Raghudevpuram");
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
const main = async (
  documentNumber = "3664",
  yearOfRegistration = "2024",
  registeredSRO = "VISAKHAPATNAM(R.O)(311)"
) => {
  const browser = await puppeteerInstance();
  const page = await browser.newPage();
  console.log(":: Automation Started");

  try {
    if (documentNumber) {
      await searchByDocumentNumber(
        page,
        "https://registration.ec.ap.gov.in/ecSearch",
        documentNumber,
        yearOfRegistration,
        registeredSRO
      );
    } else {
      await ScrapeByNone(
        page,
        "https://registration.ec.ap.gov.in/ecSearch/EncumbranceSearch",
        false
      );
    }
  } catch (error) {
    console.log(error.message);
  } finally {
    await browser.close();
  }
};

main()
  .then(() => console.log(":: Automation Completed"))
  .catch((error) => console.log(error));
