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
    }
}