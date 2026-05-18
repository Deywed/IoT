import { Pool } from "pg";
import { GraphQLResolveInfo, FieldNode } from "graphql";

const pool = new Pool({
  user: process.env.DB_USER || "myuser",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "mydb",
  password: process.env.DB_PASSWORD || "mypassword",
  port: parseInt(process.env.DB_PORT || "5432"),
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

const FIELD_TO_COLUMN: Record<string, string> = {
  id: "id",
  recorded_at: "recorded_at",
  overall_usage: "overall_usage",
  solar_generation: "solar_generation",
  fridge_kw: "fridge_kw",
  furnace_kw: "furnace_kw",
  home_office_kw: "home_office_kw",
  temperature: "temperature",
  humidity: "humidity",
  summary: "summary",
};

function selectedColumns(info: GraphQLResolveInfo): string {
  const selections = info.fieldNodes[0].selectionSet?.selections as FieldNode[];
  const cols = selections
    .map((f) => FIELD_TO_COLUMN[f.name.value])
    .filter(Boolean);
  return cols.length > 0 ? cols.join(", ") : "*";
}

export const resolvers = {
  Query: {
    getAllMeasurements: async (
      _: any,
      args: { limit?: number },
      ___: any,
      info: GraphQLResolveInfo,
    ) => {
      const cols = selectedColumns(info);
      const limit =
        Number.isFinite(args?.limit) && (args?.limit ?? 0) > 0
          ? args.limit
          : 100;
      const res = await pool.query(
        `SELECT ${cols} FROM sensor_measurements ORDER BY recorded_at DESC LIMIT $1`,
        [limit],
      );
      return res.rows;
    },

    getMeasurementById: async (
      _: any,
      { id }: { id: string },
      __: any,
      info: GraphQLResolveInfo,
    ) => {
      const cols = selectedColumns(info);
      const res = await pool.query(
        `SELECT ${cols} FROM sensor_measurements WHERE id = $1`,
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
      const {
        recorded_at,
        overall_usage,
        solar_generation,
        fridge_kw,
        furnace_kw,
        home_office_kw,
        temperature,
        humidity,
        summary,
      } = args;

      const res = await pool.query(
        `INSERT INTO sensor_measurements
           (recorded_at, overall_usage, solar_generation, fridge_kw,
            furnace_kw, home_office_kw, temperature, humidity, summary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          recorded_at || new Date().toISOString(),
          overall_usage,
          solar_generation,
          fridge_kw,
          furnace_kw,
          home_office_kw,
          temperature,
          humidity,
          summary,
        ],
      );
      return res.rows[0];
    },
  },
};
