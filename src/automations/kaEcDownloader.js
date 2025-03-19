const {
  fillInput,
  clickButton,
  delay,
  puppeteerInstance,
  selectOption,
  generatePDF,
  responseValidator,
  makeRequest,
} = require("../../utils/pupeteer");
let dummyFilePath = "public/dummy/dummy";

const fetchOtpFromEmail = require("../../utils/fetchOtp");
const logger = require("../../utils/logger");
const moment = require("moment");
// Login function
const login = async (page) => {
  await clickButton(page, "#headerMain > ul > span > li:nth-child(2) > button");
  await delay(1000);
  await fillInput(page, "#userName", process.env.KA_EC_USERNAME);
  await delay(1000);

  await fillInput(page, "#password", process.env.KA_EC_PASSWORD);
  await delay(1000);

  const imageUrl = await page.evaluate(() => {
    // Find the captcha image by its attributes (modify selector as needed)
    const captchaImg = document.querySelector('img[src*="captcha"]');
    return captchaImg ? captchaImg.getAttribute("src") : null;
  });

  if (imageUrl) {
    logger.info(`Captcha Image URL: ${imageUrl}`);
    captcha = imageUrl.match(/\/([^\/]+)\.png$/)[1];
  } else {
    logger.info("Captcha image not found!");
  }

  await fillInput(page, "#loginCaptchaUserInput1", captcha);
  await delay(2000);

  await clickButton(
    page,
    "body > div:nth-child(1) > app-root > div > div > app-header-new > main > div.popup-container.open > div > div.card-body.ng-star-inserted > div > div.col-md-7 > form > div.row > button"
  );
  // await delay(5000);
};

const getAndFillOtp = async (page) => {
  const otp = await fetchOtpFromEmail();
  await delay(2000); // Delay after fetching OTP

  await page.waitForSelector("#otp");

  await page.type("#otp", otp);

  logger.info("Filled OTP:", otp);
  await delay(2000);

  await clickButton(
    page,
    "body > div:nth-child(1) > app-root > div > div > app-header-new > main > div.popup-container.open > div > div.card-body.ng-star-inserted > div > div:nth-child(2) > form > div.row > div.col-md-8 > button"
  );
  await delay(3000);

  const invalidOtpElement = await page.$(
    "body > div:nth-child(1) > app-root > div > div > app-header-new > main > div.popup-container.open > div > div.card-body.ng-star-inserted > div > div:nth-child(2) > form > div:nth-child(2) > span"
  );
  if (invalidOtpElement) {
    const invalidOtpText = await page.evaluate(
      (el) => el.innerText,
      invalidOtpElement
    );
    if (invalidOtpText.includes("Unable to Validate OTP / Incorrect OTP")) {
      logger.info("Invalid OTP detected, retrying...");
      await page.focus("#otp");

      // Clear the OTP input field
      await page.evaluate(() => {
        document.querySelector("#otp").value = ""; // Clear OTP field by directly setting its value
      });
      // await getAndFillOtp(page);
      const otp = await fetchOtpFromEmail();
      await delay(2000); // Delay after fetching OTP
      await page.waitForSelector("#otp");

      // Focus the OTP input field to ensure it's ready for typing
      await page.focus("#otp");

      await page.$eval(
        "#otp",
        (input, otp) => {
          input.value = otp; // Set the OTP value
          input.dispatchEvent(new Event("input", { bubbles: true })); // Trigger the input event
          input.dispatchEvent(new Event("change", { bubbles: true })); // Trigger the change event
        },
        otp
      );

      await delay(2000);
      await clickButton(
        page,
        "body > div:nth-child(1) > app-root > div > div > app-header-new > main > div.popup-container.open > div > div.card-body.ng-star-inserted > div > div:nth-child(2) > form > div.row > div.col-md-8 > button"
      );
    } else {
      logger.info("Invalid OTP element not found, skipping.");
    }
  }
};

const fillAggriForm = async (page, surveyNo) => {
  await clickButton(
    page,
    "body > div:nth-child(1) > app-root > div > div > app-ec-search-citizen > div > div.containe-lg > div > div > form > div:nth-child(4) > div.row > div:nth-child(1) > label"
  );

  logger.info("clicked on aggri");
  await fillInput(page, 'input[name="surveynumber"]', surveyNo);
};

const fillNonAggriForm = async (page, propertyTypes, propertyNumber) => {
  await clickButton(
    page,
    "body > div:nth-child(1) > app-root > div > div > app-ec-search-citizen > div > div.containe-lg > div > div > form > div:nth-child(4) > div.row > div:nth-child(2) > label"
  );
  logger.info("clicked on non aggri");

  for (let index = 0; index < propertyTypes.length; index++) {
    const propertyType = propertyTypes[index];
    const selector =
      index === 0
        ? 'select[name="_currentproperttypeid"]'
        : "body > div:nth-child(1) > app-root > div > div > app-ec-search-citizen > div > div.containe-lg > div > div > form > div:nth-child(4) > div:nth-child(4) > div > table > tr:nth-child(3) > td:nth-child(1) > select";
    await delay(1000);
    await selectOption(page, selector, propertyType);

    logger.info(`selected property Type: ${propertyType} :: ${propertyNumber}`);
    await delay(1000);
    await fillInput(
      page,
      `body > div:nth-child(1) > app-root > div > div > app-ec-search-citizen > div > div.containe-lg > div > div > form > div:nth-child(4) > div:nth-child(4) > div > table > tr:nth-child(${
        index + 2
      }) > td:nth-child(2) > input`,
      propertyNumber
    );
    await delay(1000);
    if (propertyTypes[index + 1]) {
      await clickButton(
        page,
        `body > div:nth-child(1) > app-root > div > div > app-ec-search-citizen > div > div.containe-lg > div > div > form > div:nth-child(4) > div:nth-child(4) > div > table > tr:nth-child(${
          index + 3
        }) > th > button`
      );
    }
  }
};

const fillDate = async (page, selector, date) => {
  await page.$eval(
    selector,
    (input, date) => {
      input.value = date; // Set the desired date here
      input.dispatchEvent(new Event("input", { bubbles: true })); // Trigger the input event
      input.dispatchEvent(new Event("change", { bubbles: true })); // Trigger the change event
      input.removeAttribute("required");
    },
    date
  );
};

const handleDialog = async (page) => {
  new Promise((resolve) => {
    page.on("dialog", async (dialog) => {
      logger.info("Dialog message: " + dialog.message());
      logger.info("Popup detected, re-logging in...");

      await dialog.accept(); // Accept the dialog
      await delay(1000);
      await login(page); // Re-login after accepting the dialog

      resolve(); // Resolve the promise once the dialog handling is complete
    });
  });
};

const initializeKaEc = async (page, village, district, taluk, town) => {
  try {
    await page.goto("https://kaveri.karnataka.gov.in/landing-page", {
      waitUntil: "load",
      timeout: 0,
    });
    // Start the login process
    await login(page);
    logger.info("Login completed.");
    await handleDialog(page);
    await delay(2000);
    await responseValidator(
      page,
      "https://kaveri.karnataka.gov.in/api/SendEncOTP"
    );
    await delay(3000);
    await getAndFillOtp(page);
    await delay(1000);
    await clickButton(
      page,
      "body > div:nth-child(1) > app-root > div > div > app-kaveri-dashboard > div > div.animated.fadeIn.mt-3.ng-tns-c184-1 > div > div.row.p-2.ng-tns-c184-1 > div.col-md-4.d-flex.align-items-center.justify-content-center.ng-tns-c184-1 > div > button"
    );
    await delay(1000);

    await clickButton(
      page,
      "body > div:nth-child(1) > app-root > div > div > app-kaveri-dashboard > div > div.applicationTypeOverlay.ng-tns-c184-1.ng-star-inserted > div > app-application-type > div > div > div.card-body > div.row.mt-4 > div:nth-child(2) > img"
    );

    await delay(1000);

    await clickButton(
      page,
      "#mat-dialog-0 > app-perquisite > mat-dialog-actions > button"
    );
    await delay(1000);

    await clickButton(
      page,
      "#mat-dialog-0 > app-perquisite > div.overlay.ng-star-inserted > div > div > div.card-body > div:nth-child(2) > button.btn.btn-primary"
    );
    await delay(1000);
    logger.info("selecting District");
    await selectOption(page, 'select[name="district"]', district);
    await delay(1000);
    logger.info("selecting taluka");
    await selectOption(page, 'select[name="taluka"]', taluk);
    await delay(1000);
    logger.info("selecting hobli");

    await selectOption(page, 'select[name="hobli"]', town);

    await delay(1000);
    logger.info("selecting village");

    await selectOption(page, 'select[name="village"]', village);
  } catch (error) {
    logger.error(error.message);
    throw new Error(error.message);
  }
};

const formatPropertyData = (data) => {
  return data.map((item, itemIndex) => {
    const schedule = item.propertySchedules[0] || {};
    const document = item.documentDetails[0] || {};
    const parties = item.partyDetails
      .map(
        (p, index) =>
          `${index + 1}.(${
            p.partyTypeId === 1 ? "C" : "E"
          }) ${p.partyName.trim()}`
      )
      .join("\n");

    return {
      SLNo: String(itemIndex + 1),
      description: `VILL/COL: ${item.villageNamee || ""} W-B: 0-0 SURVEY: ${
        schedule.description.match(/Sy No\.\s*([\d]+)/)?.[1] || "N/A"
      }, EXTENT: ${
        schedule.description.match(/Measurement:\s*([\d\sA-Za-z.]+)/)?.[1] ||
        "N/A"
      } Boundaries: [E]: ${
        schedule.description.match(/\[EAST\]\s*([^[]+)/)?.[1].trim() || "N/A"
      } [W]: ${
        schedule.description.match(/\[WEST\]\s*([^[]+)/)?.[1].trim() || "N/A"
      } [S]: ${
        schedule.description.match(/\[SOUTH\]\s*([^[]+)/)?.[1].trim() || "N/A"
      } [N]: ${
        schedule.description.match(/\[NORTH\]\s*([^[]+)/)?.[1].trim() || "N/A"
      }`,
      dates: `(E) ${new Date(document.executionDate).toLocaleDateString(
        "en-GB"
      )}`,
      deedValue: `${item.articleNamee}\nMkt.Value: Rs. ${item.marketValue}`,
      parties: parties,
      identifiers: `${document.cdNumber}\n\n${document.documentReference} [1] of SRO (${document.sroCode})`,
    };
  });
};

const ecSearch = async (Token, payload) => {
  console.log(Token, payload);

  try {
    const ecResponse = await makeRequest(
      `https://kaveri.karnataka.gov.in/api/ECSearch`,
      "post",
      {
        Authorization: `Bearer ${Token}`,
      },
      payload
    );

    return ecResponse.data || [];
  } catch (error) {
    throw error;
  }
};

const kaLogin = async () => {
  try {
    const loginResponse = await makeRequest(
      `https://kaveri.karnataka.gov.in/api/LoginDataTest`,
      "post",
      {},
      {
        loginname:
          "Qswe5Z23xs2YeFjVMJlRgpiwIi0lf9mw6GAY4XkJKjOqBhyQkCutskvOZ26YoBm/yd9NUt8ybp2TAPqM0TaFE+Vr9OW+iMVVHFNimDFTAAuiljXlDgltAtUPmH80qcAdjUDnfRofVdP8qHnYjVa7+eINeGRcXU9FvI++1ZrKddhQKGN/c3WQTA2nbF8Q5iCcv9wp9uiDcHgjGkq6fZ82oHDpB8vYkDYiiahzFovxQVxz8llqe3X+VHTR1nv6HnjN4rAEIC2TNpj459gII/VLge6AgxoeTlwA6GG39qw8YZ5IpLgwcZMqH2NzLT5f4q4mV1p2WISbovKitWvhNWDjNg==",
        password:
          "A0cSFyrJGLaQDHcQYcz46hYeJz1sI+cM8vnxa9ukD1qoX4tuffqPle6sEsGABKrvtTAFDtDIa3ip12GhvTQu3LN5SwPg3SSO7gkMqh8VoGcN13lbbllob6SZGoLacKYdZr2jyZ0BkjfuxPGJwtJz6D5JCAZIGEkHAni+/DpVSSEqiZxj7B+5DC6pn3YGalybcZCciia5h8lwRu+hKrA9dWMErxAqgULfX6y5B3hJXCHOVQXj9dGFnU5FU2y5M0lAuIqxmjNjMw6dyy12hi75Dum+L3Ye73W4KA4wwcLhB9GR/zQARegP4+cQnt4RS4aKbcRXzsDDwZv972fPRyZDDA==",
      }
    );

    // Check if login needs to be reset
    if (
      loginResponse.data &&
      loginResponse.data.length &&
      !loginResponse.data[0].citizenid
    ) {
      console.log("Login needs to be reset. Attempting to reset...");
      await kaResetLogin();
      return kaLogin();
    }

    // Return the actual login response data
    return loginResponse.data || [];
  } catch (error) {
    console.error("Login error:", error.message);
    throw error;
  }
};

const kaResetLogin = async () => {
  try {
    const resetLoginResponse = await makeRequest(
      `https://kaveri.karnataka.gov.in/api/ResetLogoutStatus`,
      "post",
      {},
      {
        loginname:
          "bb2NTEIX0+mZnq93YIwSrFtm0p/jxn+oPUVDy4FePnkjXKRXURUF/quIojuY6CUrYHdX9jXPgcn9UPilATvGVTVJFNEz2Jn6RZxnzVfDYvELuwqNhlUhD15IXuPBNpZutu04BXljoa0gVYfFpQvOwUoL0SWe2JJXRpkL9F+oTJlUdCO+oOB5LlSSGpps2xrskkjAm9O1wDrCfWQ0AfP+L3kYGvWlWkapFRuoTLDXsVfVzB9ZLFUQbgtmw58o5R4aQG4SDKe6A+5oRmwBaCCMb7sY+SE+d2a/zdFz9j7NaJVOiNzG/TysIg95DYzFIWyr8NTukpgjl4xnbczFfSdQVA==",
      }
    );

    return resetLoginResponse.data || [];
  } catch (error) {
    throw error;
  }
};

const GetPropertyTypeMasterAsync = async () => {
  try {
    const propertyTypeResponse = await makeRequest(
      `https://kaveri.karnataka.gov.in/api/GetPropertyTypeMasterAsync`,
      "post"
    );

    return propertyTypeResponse.data || [];
  } catch (error) {
    throw error;
  }
};

const initializeKaEcV2 = async (
  _fromdate,
  _todate,
  _villageCode,
  propertyTypes,
  inputData
) => {
  _fromdate = moment(_fromdate, "DD-MM-YYYY").format("YYYY-MM-DD");
  _todate = moment(_todate, "DD-MM-YYYY").format("YYYY-MM-DD");
  const loginResponse = await kaLogin();
  const Token = loginResponse[0]?.jwtToken;
  const propertyTypeResponse = await GetPropertyTypeMasterAsync();
  const p_srch_property = propertyTypeResponse
    .filter((item) => propertyTypes.includes(item.typeNameEnglish))
    .map((item) => ({
      _currentproperttypeid: String(item.propertytypeid),
      _currentnumber: inputData,
    }));

  const ecSearchResponse = await ecSearch(Token, {
    _villageCode,
    p_srch_property,
    _fromdate,
    _todate,
    EcFilter: "p",
  });
  return ecSearchResponse;
};

async function kaEc({
  houseNo,
  surveyNo,
  village,
  ward,
  block,
  district,
  encumbranceType,
  startDate,
  endDate,
  plotNo,
  flatNo,
  taluk,
  town,
  villageCode,
}) {
  const browser = await puppeteerInstance();
  let page = await browser.newPage();
  let ecResponse = null;
  try {
    switch (encumbranceType) {
      case "ENCUMBRANCE_TYPE.ASNOS":
      case "ENCUMBRANCE_TYPE.SNOS":
        // await initializeKaEc(page, village, district, taluk, town);
        // await fillAggriForm(page, surveyNo);
        ecResponse = await initializeKaEcV2(
          startDate,
          endDate,
          villageCode,
          ["Survey No"],
          surveyNo
        );

        break;

      case "ENCUMBRANCE_TYPE.HNOS":
        // await initializeKaEc(page, village, district, taluk, town);
        // await fillNonAggriForm(page, ["House No", "Door No"], houseNo);
        ecResponse = await initializeKaEcV2(
          startDate,
          endDate,
          villageCode,
          ["House No", "Door No"],
          houseNo
        );
        break;

      // case "ENCUMBRANCE_TYPE.SNOS":
      // // await initializeKaEc(page, village, district, taluk, town);
      // // await fillNonAggriForm(page, ["Survey No"], surveyNo);
      // ecResponse = await initializeKaEcV2(
      //   startDate,
      //   endDate,
      //   villageCode,
      //   ["Survey No"],
      //   surveyNo
      // );
      // break;

      case "ENCUMBRANCE_TYPE.PNOS":
        // await initializeKaEc(page, village, district, taluk, town);
        // await fillNonAggriForm(page, ["Flat No"], plotNo);
        ecResponse = await initializeKaEcV2(
          startDate,
          endDate,
          villageCode,
          ["Flat No"],
          plotNo
        );
        break;

      case "ENCUMBRANCE_TYPE.FNOS":
        // await initializeKaEc(page, village, district, taluk, town);
        // await fillNonAggriForm(page, ["Flat No", "APT No"], flatNo);
        ecResponse = await initializeKaEcV2(
          startDate,
          endDate,
          villageCode,
          ["Flat No", "APT No"],
          flatNo
        );
        break;

      default:
        throw new Error("Invalid encumbranceType! ");
    }

    // await fillDate(page, 'input[name="fromdate"]', startDate); //startDate
    // console.log("Filled Start Date:", startDate);
    // await fillDate(page, 'input[name="fromdate"]', startDate); //startDate
    // endDate
    //   ? await fillDate(page, 'input[name="todate"]', endDate)
    //   : logger.info("Skipping Date input as it's empty");
    // //endDate

    // await delay(1000);

    // await clickButton(
    //   page,
    //   "body > div:nth-child(1) > app-root > div > div > app-ec-search-citizen > div > div.containe-lg > div > div > form > div.mt-3.text-center > button.mat-tooltip-trigger.btn.btn-primary.mr-1.ng-star-inserted"
    // );

    // const ecResponse = await responseValidator(
    //   page,
    //   "https://kaveri.karnataka.gov.in/api/ECSearch"
    // );
    // console.log(ecResponse);

    if (!ecResponse || !JSON.parse(ecResponse?.data).length) {
      logger.error("Documents not found on search data.");
      return { status: "ok", filePath: dummyFilePath, sros: "" };
    }
    let propertyData = formatPropertyData(JSON.parse(ecResponse.data));

    const filePath = await generatePDF(
      page,
      "#PdfData > table",
      `public/Downloads/${encumbranceType}`,
      true,
      propertyData
    );
    // await browser.close();
    return { status: "ok", filePath, sros: "" };
  } catch (error) {
    logger.error(error.message);

    throw new Error(error.message);
  } finally {
    // await browser.close();
  }
}

module.exports = kaEc;
