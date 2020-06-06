const scrapeTripAdvisor = async () => {
  // import launchChrome and newPage from the browser.js file in the same directory
  const { launchChrome } = require("./browser");

  // Flow 1 => Launching chrome and opening a new tab/page
  const [newPage, exitChrome] = await launchChrome();
  const [page] = await newPage();

  // exit the function if the tab is not properly opened
  if (!page) return;

  await page.setDefaultTimeout(60000);

  // Flow 2 => Visiting TripAdvisor's home page
  const url = "https://www.tripadvisor.com/";
  console.log("Opening " + url);
  try {
    await page.goto(url, {
      waitUntil: "networkidle0", // wait till all network requests has been processed
    });
  } catch (e) {
    console.error("Unable to visit " + url, e);
    await exitChrome(); // close chrome on error
    return; // exit the scraper function
  }

  const signIn = async () => {
    // Flow 3 => Clicking the sign in button
    try {
      await page.click('a[href*="RegistrationController"]');
      console.log("Clicked Sign In button");
    } catch (e) {
      console.error("Unable to click the sign in button", e);
      return;
    }
    try {
      await page.waitForNavigation({ waitUntil: "networkidle0" });
    } catch (e) {
      // console.error("could not wait for navigation");
    }

    // Flow 4 => Clicking the Continue with Email button
    try {
      const continueBtn = await page.waitForSelector(".regEmailContinue");
      await continueBtn.click();
      console.log("Clicked Continue with Email button");
    } catch (e) {
      console.error("Unable to click the Continue with Email button", e);
      return;
    }

    // Flow 5 => Reading the provided login credentials
    const {
      tripAdvisorEmail,
      tripAdvisorPassword,
      _2CaptchaAPIKey,
    } = require("../config");

    // Flow 6 => Filling in the authentication details
    try {
      const emailField = await page.waitForSelector("#regSignIn.email");
      await emailField.click({ clickCount: 3 });
      await emailField.type(tripAdvisorEmail, { delay: 75 });
      console.log("Filled in email");
    } catch (e) {
      console.error("Unable to write to the email field", e);
    }

    try {
      const passField = await page.waitForSelector("#regSignIn.password");
      await passField.click({ clickCount: 3 });
      await passField.type(tripAdvisorPassword, { delay: 75 });
      console.log("Filled in password");
    } catch (e) {
      console.error("Unable to write to the password field", e);
    }

    // Flow 7 => Solving Captchas
    const axios = require("axios");

    const initCaptchaSolvingTask = (siteKey, url) => {
      return new Promise((resolve, reject) => {
        const url = `https://2captcha.com/in.php?key=${_2CaptchaAPIKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${url}invisible=1&soft_id=9120555`;
        return axios
          .get(url, { responseType: "text" })
          .then(({ data }) => resolve(data))
          .catch((e) => {
            console.error("Unable to initiate captcha solving task", e);
            reject(e);
          });
      });
    };

    let solveRetryTimes = 0;
    const maxRetryTimes = 5;

    const getCaptchaSolution = () => {
      const url = `https://2captcha.com/res.php?key=${_2CaptchaAPIKey}&action=get&id=${initCaptcha}`;
      const waitTime = 20000; // 20 seconds

      return new Promise((resolve, reject) => {
        setTimeout(() => {
          axios
            .get(url, { responseType: "text" })
            .then(({ data }) => {
              if (!data || /^CAPT?CHA_NOT_READY$/i.test(data)) {
                console.error(`Captcha not yet solved => ${data}`);
                if (solveRetryTimes > maxRetryTimes) {
                  reject(data);
                  return;
                }
                console.log("Retrying...");
                solveRetryTimes++;
                return getCaptchaSolution()
                  .then((solution) => resolve(solution))
                  .catch((e) => console.error(e));
              }
              console.log("Captcha solved " + data);
              resolve(data);
            })
            .catch((e) => {
              console.error("Error getting solved captcha", e);
              if (solveRetryTimes > maxRetryTimes) {
                reject(e);
                return;
              }
              solveRetryTimes++;
              return getCaptchaSolution()
                .then((solution) => resolve(solution))
                .catch((e) => console.error(e));
            });
        }, waitTime);
      });
    };

    const isOk = (val) => {
      const isOk = val.indexOf("OK") === 0;
      if (!isOk) console.error("could not proceed with solving captcha");
      return isOk;
    };

    try {
      let initTaskId = await initCaptchaSolvingTask(siteKey, url);
      console.log("2Captcha Task ID " + initTaskId);
      if (!isOk(initTaskId)) {
        console.error("Could not start the captcha solving process");
        return;
      }

      // remove "OK|" at the start of the initTaskId
      initTaskId = await initTaskId.substr(3);

      let captchaSolution = await getCaptchaSolution();
      console.log("only a moment to go...");

      // remove "OK|" at the start of the captchaSolution
      captchaSolution = await captchaSolution.substr(3);

      // 2Captcha provides you with a submit to use the captchaSolution and submit the form to sign in. Bear in mind that you will be using the page.evaluate function here
    } catch (e) {
      console.error("Unable to solve captcha and login", e);
    }
  };

  await signIn();

  // Flow 8 => Clicking the Hotels Link
  try {
    await page.evaluate(() =>
      document.querySelector('a[href^="/Hotels"]').click()
    );
    console.log("Clicked Hotels Link");
  } catch (e) {
    console.error("Unable to click the hotels link", e);
    await exitChrome(); // close chrome on error
    return; // exit the scraper function
  }

  // Flow 9 => Typing London
  try {
    await page.keyboard.type("London");
    console.log("Typed London");
  } catch (e) {
    console.error("Unable to type London", e);
    await exitChrome(); // close chrome on error
    return; // exit the scraper function
  }

  // Flow 10 => CLicking London
  try {
    const london = await page.waitForSelector(
      'form[action="/Search"] a[href*="London"]'
    );
    await london.click();
    try {
      await page.waitForNavigation({ waitUntil: "networkidle0" });
    } catch (e) {}
    console.log("Clicked London");
  } catch (e) {
    console.error("Unable to click london");
    await exitChrome(); // close chrome on error
    return; // exit the scraper function
  }

  // Flow 11 => Extracting the names, services, prices, and ratings & reviews of listed hotels
  let hotelsInfo;
  try {
    hotelsInfo = await page.evaluate(() => {
      let extractedListings = [];
      const listings = document.querySelectorAll(".listItem");
      const listingsLen = listings.length;

      for (let i = 0; i < listingsLen; i++) {
        try {
          const listing = listings[i];
          const name = listing.querySelector(".listing_title a").innerText;
          const services = (
            listing.querySelector(".icons_list").innerText || ""
          ).replace("\n", ", ");
          const price = listing.querySelector(".price").innerText;
          const ratings = listing
            .querySelector(".ui_bubble_rating")
            .getAttribute("alt");
          const reviews = listing.querySelector(".review_count").innerText;

          extractedListings.push({ name, services, price, ratings, reviews });
        } catch (e) {}
      }

      return extractedListings;
    });

    // do anything with hotelsInfo
    console.log("Hotels Info", hotelsInfo);
  } catch (e) {
    console.error("Unable to extract hotels listings", e);
  }

  // Flow 12 => Exiting Chrome
  await exitChrome();

  if (!hotelsInfo || hotelsInfo.length < 1) return; // exit the function if no hotels

  // Flow 13 => Saving extracted hotels to a JSON file
  (() => {
    const fileName = "extracted-data/hotels.json";
    const data = JSON.stringify(hotelsInfo);
    const { writeFile } = require("fs");
    writeFile(fileName, data, (err) => {
      if (err) return console.error("Unable to save json to file", err);
      console.log("Data successfully saved to file in json");
    });
  })();

  // Flow 14 => Saving extracted hotels to a CSV file
  (async () => {
    const fileName = "extracted-data/hotels.csv";
    const ObjectsToCsv = require("objects-to-csv");
    const csv = new ObjectsToCsv(hotelsInfo);
    try {
      await csv.toDisk(fileName);
      console.log("Data successfully saved to file in CSV");
    } catch (e) {
      console.error("Unable to save csv to file", e);
    }
  })();
};

module.exports = scrapeTripAdvisor;
