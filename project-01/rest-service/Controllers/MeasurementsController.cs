using Dapper;
using Npgsql;
using Microsoft.AspNetCore.Mvc;
using rest_service.Models;

namespace rest_service.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class MeasurementsController(IConfiguration configuration) : ControllerBase
    {
        private readonly string _connectionString = configuration.GetConnectionString("DefaultConnection")!;

        // GET: api/measurements
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            using var connection = new NpgsqlConnection(_connectionString);
            var sql = @"SELECT id, recorded_at AS RecordedAt, overall_usage AS OverallUsage,
                               solar_generation AS SolarGeneration, fridge_kw AS FridgeKw,
                               furnace_kw AS FurnaceKw, home_office_kw AS HomeOfficeKw,
                               temperature, humidity, summary
                        FROM sensor_measurements ORDER BY recorded_at DESC LIMIT 100";
            return Ok(await connection.QueryAsync<Measurement>(sql));
        }

        // SCENARIO B: Samo temperature + humidity
        [HttpGet("selective")]
        public async Task<IActionResult> GetSelective()
        {
            using var connection = new NpgsqlConnection(_connectionString);
            var sql = @"SELECT id, recorded_at AS RecordedAt, temperature, humidity
                        FROM sensor_measurements ORDER BY recorded_at DESC LIMIT 100";
            return Ok(await connection.QueryAsync(sql));
        }

        // SCENARIO C: Agregacije
        [HttpGet("average-stats")]
        public async Task<IActionResult> GetStats()
        {
            using var connection = new NpgsqlConnection(_connectionString);
            var sql = @"SELECT AVG(temperature)    AS AvgTemp,
                               MAX(temperature)    AS MaxTemp,
                               AVG(overall_usage)  AS AvgUsage,
                               MAX(overall_usage)  AS MaxUsage,
                               COUNT(*)            AS TotalReadings
                        FROM sensor_measurements";
            return Ok(await connection.QuerySingleOrDefaultAsync(sql));
        }

        // POST: api/measurements
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] Measurement m)
        {
            if (m.RecordedAt == default)
                m.RecordedAt = DateTime.UtcNow;

            using var connection = new NpgsqlConnection(_connectionString);
            var sql = @"INSERT INTO sensor_measurements
                            (recorded_at, overall_usage, solar_generation, fridge_kw,
                             furnace_kw, home_office_kw, temperature, humidity, summary)
                        VALUES
                            (@RecordedAt, @OverallUsage, @SolarGeneration, @FridgeKw,
                             @FurnaceKw, @HomeOfficeKw, @Temperature, @Humidity, @Summary)
                        RETURNING id";

            m.Id = await connection.ExecuteScalarAsync<long>(sql, m);
            return CreatedAtAction(nameof(GetAll), new { id = m.Id }, m);
        }
    }
}
