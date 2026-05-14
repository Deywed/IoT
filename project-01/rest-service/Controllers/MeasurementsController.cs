using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Dapper;           // Za QueryAsync i QuerySingleOrDefaultAsync
using Npgsql;
using Microsoft.AspNetCore.Mvc;
using rest_service.Models;

namespace rest_service.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class MeasurementsController : ControllerBase
    {
        private readonly string _connectionString;

        public MeasurementsController(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection");
        }

        // GET: api/measurements (Sva merenja)
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            using var connection = new NpgsqlConnection(_connectionString);
            var sql = "SELECT id, recorded_at as RecordedAt, overall_usage as OverallUsage, temperature, summary FROM sensor_measurements ORDER BY recorded_at DESC LIMIT 100";
            var measurements = await connection.QueryAsync<Measurement>(sql);
            return Ok(measurements);
        }

        // SCENARIO C: Prosečna temperatura (Agregacija)
        [HttpGet("average-stats")]
        public async Task<IActionResult> GetStats()
        {
            using var connection = new NpgsqlConnection(_connectionString);
            var sql = @"
            SELECT 
                AVG(temperature) as AvgTemp, 
                MAX(temperature) as MaxTemp, 
                COUNT(*) as TotalReadings 
            FROM sensor_measurements";

            var stats = await connection.QuerySingleOrDefaultAsync(sql);
            return Ok(stats);
        }
        // Dodaj ovaj metod unutar klase MeasurementsController

        // SCENARIO B: Samo 2 polja (temperature + humidity) - selective monitoring
        [HttpGet("selective")]
        public async Task<IActionResult> GetSelective()
        {
            using var connection = new NpgsqlConnection(_connectionString);
            var sql = "SELECT id, recorded_at as RecordedAt, temperature, humidity FROM sensor_measurements ORDER BY recorded_at DESC LIMIT 100";
            var data = await connection.QueryAsync(sql);
            return Ok(data);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] Measurement measurement)
        {
            // Postavljamo vreme ako nije poslato
            if (measurement.RecordedAt == default)
                measurement.RecordedAt = DateTime.UtcNow;

            using var connection = new NpgsqlConnection(_connectionString);

            var sql = @"
        INSERT INTO sensor_measurements (recorded_at, overall_usage, temperature, summary) 
        VALUES (@RecordedAt, @OverallUsage, @Temperature, @Summary)
        RETURNING id";

            // Izvršavamo upit i dobijamo nazad ID novog zapisa
            var id = await connection.ExecuteScalarAsync<int>(sql, measurement);

            measurement.Id = id;
            return CreatedAtAction(nameof(GetAll), new { id = measurement.Id }, measurement);
        }
    }
}