export const typeDefs = `#graphql
  type Measurement {
    id:               ID!
    recorded_at:      String!
    overall_usage:    Float
    solar_generation: Float
    fridge_kw:        Float
    furnace_kw:       Float
    home_office_kw:   Float
    temperature:      Float
    humidity:         Float
    summary:          String
  }

  type Query {
    getAllMeasurements(limit: Int):  [Measurement]
    getMeasurementById(id: ID!):    Measurement
    getAverageTemperature:          Float
  }

  type Mutation {
    createMeasurement(
      recorded_at:      String
      overall_usage:    Float
      solar_generation: Float
      fridge_kw:        Float
      furnace_kw:       Float
      home_office_kw:   Float
      temperature:      Float!
      humidity:         Float
      summary:          String
    ): Measurement
  }
`;
