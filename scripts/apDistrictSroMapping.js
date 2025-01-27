const axios = require("axios");
const {
  villageDistrictBackup,
  insertLatestSro,
  restoreLatestSros,
} = require("../src/services/nirnai.service");
const logger = require("../utils/logger");

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

const fetchApSroDistricts = async () => {
  const districtSroMapping = [];

  await Promise.all(
    districts.map(async (district) => {
      try {
        const response = await axios.post(
          `http://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getSroList`,
          {
            params: {
              drCode: district.id,
            },
          }
        );

        if (response.data && response.data.data) {
          const districtData = response.data.data.map((sro) => ({
            tenant: "38784e96-6b31-4fa1-9072-648304b6b67d",
            code: "STATE.ANDHRA_PRADESH",
            state: "ANDHRA PRADESH",
            district: district.drname,
            sroName: sro.srname,
            createdUser: "4cdfcf9b-0cc9-4c70-9686-22856d6ed01f",
            createdTenant: "0a2ab4d3-4070-4b5f-bcb0-9611a07e0c49",
          }));

          districtSroMapping.push(...districtData);
        }
      } catch (error) {
        console.error(
          `Error fetching SRO for district ${district.drname}:`,
          error
        );
      }
    })
  );
  return districtSroMapping;
};

const apProcedure = async () => {
  let state = "ANDHRA PRADESH";
  try {
    apData = await fetchApSroDistricts();
    const backupResponse = await villageDistrictBackup({ state }); //backupResponse
    const insertResponse = await insertLatestSro(apData); //insert latest data
  } catch (error) {
    logger.error(`Error occured: ${error.message}`);
    const restoreResponse = restoreLatestSros({ state }); //rollback
  }
};

apProcedure();
