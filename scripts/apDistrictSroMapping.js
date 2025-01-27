const districts = [
  {
    id: "TUQvTmYvTXc9PQ==",
    drcode: "03_3",
    drname: "ALLURI SITHARAMA RAJU",
  },
  {
    id: "TUQvTmYvTVE9PQ==",
    drcode: "03_1",
    drname: "ANAKAPALLI",
  },
  {
    id: "TVQvSmYvTVE9PQ==",
    drcode: "12_1",
    drname: "ANANTAPUR",
  },
  {
    id: "TVQvRmYvTWc9PQ==",
    drcode: "11_2",
    drname: "ANNAMAYA",
  },
  {
    id: "TUQvZGYvTXc9PQ==",
    drcode: "07_3",
    drname: "BAPATLA",
  },
  {
    id: "TVQvQmYvTVE9PQ==",
    drcode: "10_1",
    drname: "CHITOOR",
  },
  {
    id: "TVQvRmYvTVE9PQ==",
    drcode: "11_1",
    drname: "CUDDAPAH",
  },
  {
    id: "TUQvUmYvTWc9PQ==",
    drcode: "04_2",
    drname: "EAST GODAVARI",
  },
  {
    id: "TUQvVmYvTWc9PQ==",
    drcode: "05_2",
    drname: "ELURU",
  },
  {
    id: "TUQvZGYvTVE9PQ==",
    drcode: "07_1",
    drname: "GUNTUR",
  },
  {
    id: "TUQvUmYvTVE9PQ==",
    drcode: "04_1",
    drname: "KAKINADA",
  },
  {
    id: "TUQvUmYvTXc9PQ==",
    drcode: "04_3",
    drname: "KONASEEMA",
  },
  {
    id: "TUQvWmYvTVE9PQ==",
    drcode: "06_1",
    drname: "KRISHNA",
  },
  {
    id: "TVQvTmYvTVE9PQ",
    drcode: "13_1",
    drname: "KURNOOL",
  },
  {
    id: "TVQvTmYvTWc9PQ==",
    drcode: "13_2",
    drname: "NANDYAL",
  },
  {
    id: "TUQvbGYvTWc9PQ==",
    drcode: "09_2",
    drname: "NELLORE",
  },
  {
    id: "TUQvWmYvTWc9PQ==",
    drcode: "06_2",
    drname: "NTR",
  },
  {
    id: "TUQvZGYvTWc9PQ==",
    drcode: "07_2",
    drname: "PALNADU",
  },
  {
    id: "TUQvSmYvTWc9PQ==",
    drcode: "02_2",
    drname: "PARVATIPURAM MANYAM",
  },
  {
    id: "TUQvaGYvTWc9PQ==",
    drcode: "08_2",
    drname: "PRAKASAM",
  },
  {
    id: "TVQvSmYvTWc9PQ==",
    drcode: "12_2",
    drname: "SRI SATYASAI",
  },
  {
    id: "TUQvRmYvTVE9PQ==",
    drcode: "01_1",
    drname: "SRIKAKULAM",
  },
  {
    id: "TVQvQmYvTWc9PQ==",
    drcode: "10_2",
    drname: "TIRUPATI",
  },
  {
    id: "TUQvTmYvTWc9PQ==",
    drcode: "03_2",
    drname: "VISAKHAPATNAM",
  },
  {
    id: "TUQvSmYvTVE9PQ==",
    drcode: "02_1",
    drname: "VIZIANAGARAM",
  },
  {
    id: "TUQvVmYvTVE9PQ==",
    drcode: "05_1",
    drname: "WEST GODAVARI",
  },
];
const axios = require("axios");
const fs = require("fs");

const { delay } = require("../utils/pupeteer");
const districtSroMapping = [];

const promises = districts.map(async (district) => {
  const response = await axios.post(
    `http://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getSroList`,
    {
      params: {
        drCode: district.id,
      },
    }
  );

  return {
    district: district.drname,
    sro: response.data.data.map((sro) => sro.srname),
  };
});

Promise.all(promises)
  .then((data) => {
    districtSroMapping.push(...data); // Spread operator to add all elements
    console.log(districtSroMapping);

    fs.writeFileSync(
      "apDistrictSroMapping.json",
      JSON.stringify(districtSroMapping)
    );
  })
  .catch((error) => {
    console.error(error);
  });
