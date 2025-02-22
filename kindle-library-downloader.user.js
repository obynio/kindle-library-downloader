// ==UserScript==
// @name         Kindle Library Downloader
// @namespace    http://tampermonkey.net/
// @version      2025-02-21
// @description  Download your Kindle library to your computer
// @author       MakeFunStuff
// @match        https://www.amazon.com/*/digital-console/contentlist/booksAll/*
// @match        https://www.amazon.com/*/*/digital-console/contentlist/booksAll/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=amazon.com
// @grant        none
// @downloadURL  https://github.com/Make-Fun-Stuff/kindle-library-downloader/raw/refs/heads/main/kindle-library-downloader.user.js
// @updateURL  https://github.com/Make-Fun-Stuff/kindle-library-downloader/raw/refs/heads/main/kindle-library-downloader.user.js
// ==/UserScript==

const TEST_MODE = false; // turn on to download a single book from the current page (for testing)
const DRY_RUN = false; // turn on to do everything other than actually download the books

const DELAY_BETWEEN_BOOKS_SECONDS = 10;
const BUTTON_ID = "download-lib-button";

const log = (msg) => {
  console.log(`[LIB_DOWNLOADER] ${msg}`);
};

const getTitleButtons = () => {
  return [
    ...document.querySelectorAll('[id="MORE_ACTION:false"]'),
    ...document.querySelectorAll("#mobile-content-see-more-actions"),
  ];
};

const waitUntil = async (condFn) => {
  return new Promise((resolve) => {
    const intervalId = setInterval(() => {
      if (condFn()) {
        clearInterval(intervalId);
        resolve();
      }
    }, 250);
  });
};

const waitUntilElement = async (selectorFn, timeout, timeoutMsg) => {
  const CHECK_TIME = 250;
  var time = 0;
  const tout = timeout || 5000;
  return new Promise((resolve, reject) => {
    const intervalId = setInterval(() => {
      const val = selectorFn();
      if (time > tout) {
        clearInterval(intervalId);
        const msg = timeoutMsg || "Timeout! Something went wrong :(";
        log(msg);
        window.alert(msg);
        reject();
      }
      if (!!val) {
        clearInterval(intervalId);
        resolve(val);
      }
      time += CHECK_TIME;
    }, CHECK_TIME);
  });
};

const countdown = async (numSecs) => {
  var time = numSecs;
  return new Promise((resolve, reject) => {
    const intervalId = setInterval(() => {
      const button = document.querySelector(`#${BUTTON_ID}`);
      if (time <= 0) {
        if (button) {
          button.textContent = "Download All";
        }
        clearInterval(intervalId);
        resolve();
      }
      if (button) {
        button.textContent = `Waiting (${time})`;
      }
      log(time);
      time -= 1;
    }, 1000);
  });
};

const getBookTitle = (index) => {
  const allTitles = Array.from(
    document.querySelectorAll(".digital_entity_title")
  );
  if (!allTitles || allTitles.length <= index || !allTitles[index]) {
    return "Unknown title";
  }
  return allTitles[index].innerText;
};

const downloadBook = async (index) => {
  const title = getBookTitle(index);
  log(`Downloading ${title}`);
  log('Clicking "More Actions"');
  getTitleButtons()[index].click();
  log("Waiting for dropdown");
  await waitUntilElement(
    () =>
      document.querySelectorAll("[class*=Dropdown-module_dropdown_container]")[
        index
      ]
  );
  log("Choosing dropdown option");
  const option = Array.from(
    document
      .querySelectorAll("[class*=Dropdown-module_dropdown_container]")
      [index].querySelectorAll("span")
  ).find((_) => _.innerText.includes("Download & transfer"));
  if (!option) {
    log(`Skipping "${title}," probably because it's Kindle Unlimited`);
    document.querySelector(".body-inner").click(); // click outside the dropdown to close it
    return false;
  }
  option.click();
  log("Selecting first supported device");
  const radioButton = await waitUntilElement(
    () =>
      document
        .querySelectorAll("[class*=Dropdown-module_dropdown_container]")
        [index].querySelector("[class*=RadioButton]"),
    5000,
    "Could not select a Kindle. You need a device registered to your account, though this download process won't actually download anything to that device."
  );
  radioButton.click();
  log("Clicking download");
  const downloadButton = await waitUntilElement(() =>
    document.querySelector(
      "[id*='DOWNLOAD_AND_TRANSFER_DIALOG'] [class*=DeviceDialogBox-module_container__] [id*='CONFIRM']"
    )
  );
  if (!DRY_RUN) {
    downloadButton.click();

    log("Closing popup");
    const closeButton = await waitUntilElement(() =>
      document.querySelector("[class*=Notification-module_close]")
    );
    closeButton.click();
  } else {
    const closeButton = await waitUntilElement(() =>
      document
        .querySelectorAll("[id*=DOWNLOAD_AND_TRANSFER_DIALOG]")
        [index].querySelector("[class*=DeviceDialogBox-module_close]")
    );
    closeButton.click();
  }
  log("Waiting before moving on so Amazon doesn't get mad...");
  await countdown(DRY_RUN ? 0 : DELAY_BETWEEN_BOOKS_SECONDS);
  return true;
};

const downloadCurrentPage = async () => {
  if (TEST_MODE) {
    await downloadBook(1);
    log("Ending after one book (TEST MODE)");
    return;
  }
  let count = 0;
  for (const bookIndex of [...Array(getTitleButtons().length).keys()]) {
    log(`Downloading book ${count + 1} on this page`);
    const valid = await downloadBook(bookIndex);
    if (valid) {
      count += 1;
    }
  }
  return count;
};

const getCurrentPageNum = () =>
  document.querySelector(".page-item.active").innerText;

const downloadAllPages = async () => {
  if (TEST_MODE) {
    await downloadCurrentPage();
    log("Ending after one page (TEST MODE)");
    return;
  }
  const startPageIndex = parseInt(getCurrentPageNum()) - 1;
  const pageSelectors = document.querySelectorAll(".pagination .page-item");
  const numPages = pageSelectors.length;
  log(`Downloading all ${numPages} pages, starting from ${startPageIndex + 1}`);
  let count = 0;
  for (const curPageIndex of [...Array(numPages - startPageIndex).keys()]) {
    const curPage = startPageIndex + curPageIndex + 1;
    log(`Clicking on page selector (index ${curPage})`);
    await waitUntil(() => !!document.querySelector(`#page-${curPage}`));
    document.querySelector(`#page-${curPage}`).click();
    log(`Making sure we're on the right page and books have loaded`);
    await waitUntil(
      () =>
        parseInt(getCurrentPageNum()) === curPage &&
        getTitleButtons().length > 0
    );
    log(`Downloading page ${curPage}`);
    const numPageBooks = await downloadCurrentPage();
    log(`Downloaded all ${numPageBooks} titles on this page`);
    count += numPageBooks;
  }
  log(`All ${count} books have been downloaded!`);
  window.alert(`All ${count} books have been downloaded!`);
};

const setup = () => {
  log('Adding "Download All" button');
  const container = document.querySelector("#CONTENT_TASK_BAR");
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.textContent = "Download All";
  button.setAttribute("class", "action_button");
  button.onclick = async () => {
    button.setAttribute("disabled", true);
    await downloadAllPages();
  };
  container.appendChild(button);
};

(function () {
  "use strict";
  log("Waiting for page to finish loading...");
  waitUntil(() => getTitleButtons().length > 0).then(setup);
})();
