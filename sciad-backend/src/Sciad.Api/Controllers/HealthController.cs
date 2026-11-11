using Microsoft.AspNetCore.Mvc;
using Sciad.Infrastructure.Persistence;

namespace Sciad.Api.Controllers;

/// <summary>
/// Comprueba que la API responde y que la conexión a PostgreSQL está operativa.
/// </summary>
[ApiController]
[Route("api/health")]
public sealed class HealthController : ControllerBase
{
    private readonly SciadDbContext _db;

    public HealthController(SciadDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        bool dbOk;
        try
        {
            dbOk = await _db.Database.CanConnectAsync(ct);
        }
        catch
        {
            dbOk = false;
        }

        var body = new
        {
            status = dbOk ? "ok" : "degraded",
            database = dbOk ? "up" : "down",
            timestamp = DateTime.UtcNow,
        };

        return dbOk ? Ok(body) : StatusCode(StatusCodes.Status503ServiceUnavailable, body);
    }
}
