const districts = [
  { drname: "ADILABAD", drcode: "19_1" },
  { drname: "BHADRADRI KOTHAGUDEM", drcode: "22_2" },
  { drname: "HANUMAKONDA", drcode: "21_1" },
  { drname: "HYDERABAD", drcode: "16_1" },
  { drname: "JAGTIAL", drcode: "20_2" },
  { drname: "JANGAON", drcode: "21_3" },
  { drname: "JAYASHANKAR BHOOPALPALLY", drcode: "21_4" },
  { drname: "JOGULAMBA GADWAL", drcode: "14_2" },
  { drname: "KAMAREDDY", drcode: "18_2" },
  { drname: "KARIMNAGAR", drcode: "20_1" },
  { drname: "KHAMMAM", drcode: "22_1" },
  { drname: "KOMARAM BHEEM ASIFABAD", drcode: "19_4" },
  { drname: "MAHABUBABAD", drcode: "21_5" },
  { drname: "MAHABUBNAGAR", drcode: "14_1" },
  { drname: "MANCHERIAL", drcode: "19_3" },
  { drname: "MEDAK", drcode: "17_1" },
  { drname: "MEDCHAL-MALKAJGIRI", drcode: "15_2" },
  { drname: "MULUGU", drcode: "21_6" },
  { drname: "NAGARKURNOOL", drcode: "14_3" },
  { drname: "NALGONDA", drcode: "23_1" },
  { drname: "NARAYANPET", drcode: "14_5" },
  { drname: "NIRMAL", drcode: "19_2" },
  { drname: "NIZAMABAD", drcode: "18_1" },
  { drname: "PEDDAPALLI", drcode: "20_4" },
  { drname: "RAJANNA SIRCILLA", drcode: "20_3" },
  { drname: "RANGAREDDY", drcode: "15_1" },
  { drname: "SANGAREDDY", drcode: "17_2" },
  { drname: "SIDDIPET", drcode: "17_3" },
  { drname: "SURYAPET", drcode: "23_2" },
  { drname: "VIKARABAD", drcode: "15_3" },
  { drname: "VIKARABAD", drcode: "15_3" },
  { drname: "VIKARABAD", drcode: "15_3" },
  { drname: "WANAPARTHY", drcode: "14_4" },
  { drname: "WARANGAL", drcode: "21_2" },
  { drname: "YADADRI BHUVANAGIRI", drcode: "23_3" },
];

const axios = require("axios");
const fs = require("fs");
const { delay } = require("../utils/pupeteer");
const districtSroMapping = [];

const promises = districts.map(async (district) => {
  const response = await axios.get(
    `https://registration.telangana.gov.in/getsrolist.htm?districtCode=${district.drcode}`
  );

  return {
    district: district.drname,
    sro: response.data
      .split("##")
      .filter((item) => item && item.trim() !== "")
      .map((item) => {
        const [name, code] = item.split("/");
        return `${name}(${code})`;
      }),
  };
});

Promise.all(promises)
  .then((data) => {
    districtSroMapping.push(...data); // Spread operator to add all elements

    fs.writeFileSync(
      "tgDistrictSroMapping.json",
      JSON.stringify(districtSroMapping)
    );
  })
  .catch((error) => {
    console.error(error);
  });
