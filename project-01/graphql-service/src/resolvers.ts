import { Pool } from "pg";

// Konfiguracija konekcije (isti podaci kao u Go i .NET servisu)
const pool = new Pool({
  user: "myuser",
  host: "localhost",
  database: "mydb",
  password: "mypassword",
  port: 5432,
});

export const resolvers = {
  Query: {
    getAllMeasurements: async () => {
      const res = await pool.query(
        "SELECT * FROM sensor_measurements ORDER BY recorded_at DESC",
      );
      return res.rows;
    },
    getMeasurementById: async (_: any, { id }: { id: string }) => {
      const res = await pool.query(
        "SELECT * FROM sensor_measurements WHERE id = $1",
        [id],
      );
      return res.rows[0];
    },
    getAverageTemperature: async () => {
      const res = await pool.query(
        "SELECT AVG(temperature) FROM sensor_measurements",
      );
      return res.rows[0].avg;
    },
  },
  Mutation: {
    createMeasurement: async (_: any, args: any) => {
      const { recorded_at, overall_usage, temperature, summary } = args;
      const timestamp = recorded_at || new Date().toISOString();

      const query = `
        INSERT INTO sensor_measurements (recorded_at, overall_usage, temperature, summary)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const values = [timestamp, overall_usage, temperature, summary];
      const res = await pool.query(query, values);

      return res.rows[0];
    },
  },
};
