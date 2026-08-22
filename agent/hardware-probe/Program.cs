using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using LibreHardwareMonitor.Hardware;

if (args.Length != 1)
{
    Console.Error.WriteLine("Usage: HardwareProbe <output-json>");
    return 2;
}

var outputPath = Path.GetFullPath(args[0]);
var outputDirectory = Path.GetDirectoryName(outputPath) ?? throw new InvalidOperationException("Invalid output path.");
Directory.CreateDirectory(outputDirectory);

var computer = new Computer
{
    IsCpuEnabled = true,
    IsGpuEnabled = true,
    IsMemoryEnabled = true,
    IsMotherboardEnabled = true,
    IsControllerEnabled = true,
    IsStorageEnabled = true
};

try
{
    try
    {
        EnsurePawnIo(outputDirectory);
    }
    catch (Exception error)
    {
        AppendLog(outputDirectory, $"PawnIO setup warning: {error}");
    }

    computer.Open();
    try
    {
        AppendLog(outputDirectory,
            $"PawnIO status after Computer.Open(): installed={LibreHardwareMonitor.PawnIo.PawnIo.IsInstalled}, " +
            $"version={LibreHardwareMonitor.PawnIo.PawnIo.Version}");
        File.WriteAllText(Path.Combine(outputDirectory, "hardware-report.txt"), computer.GetReport());
    }
    catch (Exception error)
    {
        AppendLog(outputDirectory, $"hardware diagnostic warning: {error}");
    }

    AppDomain.CurrentDomain.ProcessExit += (_, _) => computer.Close();
    var updater = new UpdateVisitor();
    while (true)
    {
        try
        {
            // Process any pending fan control command from the agent
            ProcessFanControlRequests(computer, outputDirectory);

            computer.Accept(updater);
            var sensors = new List<SensorSnapshot>();
            foreach (var hardware in computer.Hardware)
            {
                CollectSensors(hardware, sensors);
            }

            var payload = new ProbeSnapshot(DateTime.UtcNow, sensors);
            var temporaryPath = outputPath + ".tmp";
            File.WriteAllText(temporaryPath, JsonSerializer.Serialize(payload, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            }));
            File.Move(temporaryPath, outputPath, true);
        }
        catch (Exception error)
        {
            AppendLog(outputDirectory, error.ToString());
        }

        Thread.Sleep(TimeSpan.FromSeconds(5));
    }
}
catch (Exception error)
{
    AppendLog(outputDirectory, $"startup {error}");
    return 1;
}
finally
{
    computer.Close();
}

static void ProcessFanControlRequests(IComputer computer, string outputDirectory)
{
    var commandFile = Path.Combine(outputDirectory, "fan-control.json");
    if (!File.Exists(commandFile)) return;

    try
    {
        var content = File.ReadAllText(commandFile);
        using var doc = JsonDocument.Parse(content);
        var root = doc.RootElement;

        var sensorId = root.TryGetProperty("sensorId", out var idProp) ? idProp.GetString() : null;
        var sensorName = root.TryGetProperty("sensorName", out var nameProp) ? nameProp.GetString() : null;
        var hardwareId = root.TryGetProperty("hardwareId", out var hwProp) ? hwProp.GetString() : null;
        var mode = root.TryGetProperty("mode", out var modeProp) ? modeProp.GetString()?.ToLowerInvariant() : "manual";
        var speedPercent = root.TryGetProperty("speedPercent", out var speedProp) ? speedProp.GetSingle() : 50f;

        var allSensors = new List<ISensor>();
        void AddHardwareSensors(IHardware hw)
        {
            allSensors.AddRange(hw.Sensors);
            foreach (var child in hw.SubHardware) AddHardwareSensors(child);
        }
        foreach (var hw in computer.Hardware) AddHardwareSensors(hw);

        var matchedSensors = allSensors.Where(s =>
        {
            if (!string.IsNullOrEmpty(sensorId) && s.Identifier.ToString().Equals(sensorId, StringComparison.OrdinalIgnoreCase))
                return true;
            if (!string.IsNullOrEmpty(sensorName) && s.Name.Equals(sensorName, StringComparison.OrdinalIgnoreCase))
                return true;
            return false;
        }).ToList();

        // If no direct sensor matched, check if all fans should be set (e.g. global mode)
        if (matchedSensors.Count == 0 && (sensorId == "all" || string.IsNullOrEmpty(sensorId)))
        {
            matchedSensors = allSensors.Where(s => s.SensorType == SensorType.Control || s.Control != null).ToList();
        }

        var results = new List<object>();
        foreach (var sensor in matchedSensors)
        {
            if (sensor.Control != null)
            {
                if (mode == "auto" || mode == "default")
                {
                    sensor.Control.SetDefault();
                    results.Add(new { sensorId = sensor.Identifier.ToString(), mode = "auto", status = "default" });
                }
                else
                {
                    var clampedSpeed = Math.Clamp(speedPercent, 0f, 100f);
                    sensor.Control.SetSoftware(clampedSpeed);
                    results.Add(new { sensorId = sensor.Identifier.ToString(), mode = "manual", speedPercent = clampedSpeed, status = "software" });
                }
            }
            else
            {
                results.Add(new { sensorId = sensor.Identifier.ToString(), error = "control_not_supported" });
            }
        }

        var resultFile = Path.Combine(outputDirectory, "fan-control-result.json");
        File.WriteAllText(resultFile, JsonSerializer.Serialize(new
        {
            success = results.Count > 0,
            executedAt = DateTime.UtcNow,
            results
        }));

        File.Delete(commandFile);
        AppendLog(outputDirectory, $"Fan control processed: mode={mode}, speed={speedPercent}%, matched={matchedSensors.Count}");
    }
    catch (Exception error)
    {
        AppendLog(outputDirectory, $"Fan control error: {error}");
        try
        {
            var resultFile = Path.Combine(outputDirectory, "fan-control-result.json");
            File.WriteAllText(resultFile, JsonSerializer.Serialize(new { success = false, error = error.Message }));
            File.Delete(commandFile);
        }
        catch { }
    }
}

static void CollectSensors(IHardware hardware, List<SensorSnapshot> snapshots)
{
    foreach (var sensor in hardware.Sensors)
    {
        var sensorName = CanonicalSensorName(hardware, sensor);
        if (sensor.Value is null)
        {
            continue;
        }

        if (sensor.SensorType == SensorType.Power && sensor.Value.Value <= 0)
        {
            continue;
        }

        if (sensor.SensorType == SensorType.Temperature &&
            (sensor.Value.Value <= 0 || sensor.Value.Value > 150 ||
             sensor.Name.Contains("Warning Temperature", StringComparison.OrdinalIgnoreCase) ||
             sensor.Name.Contains("Critical Temperature", StringComparison.OrdinalIgnoreCase) ||
             IsDisconnectedAuxTemperature(hardware, sensor, sensorName)))
        {
            continue;
        }

        if (sensor.SensorType == SensorType.Fan && sensor.Value.Value < 0)
        {
            continue;
        }

        if (sensor.SensorType == SensorType.Control && (sensor.Value.Value < 0 || sensor.Value.Value > 100))
        {
            continue;
        }

        if (sensor.SensorType != SensorType.Temperature &&
            sensor.SensorType != SensorType.Power &&
            sensor.SensorType != SensorType.Fan &&
            sensor.SensorType != SensorType.Control)
        {
            continue;
        }

        var controlSupported = sensor.Control != null;
        var controlId = sensor.Control != null ? sensor.Identifier.ToString() : null;

        snapshots.Add(new SensorSnapshot(
            hardware.Identifier.ToString(),
            hardware.HardwareType.ToString(),
            hardware.Name.TrimEnd('\0', ' '),
            sensor.Identifier.ToString(),
            sensorName,
            sensor.SensorType.ToString(),
            sensor.Value.Value,
            controlSupported,
            controlId));
    }

    foreach (var child in hardware.SubHardware)
    {
        CollectSensors(child, snapshots);
    }
}

static string CanonicalSensorName(IHardware hardware, ISensor sensor)
{
    var hardwareIdentity = $"{hardware.Identifier} {hardware.Name}";
    if (sensor.SensorType != SensorType.Temperature ||
        !hardwareIdentity.Contains("NCT6779D", StringComparison.OrdinalIgnoreCase))
    {
        return sensor.Name;
    }

    var identifierParts = sensor.Identifier.ToString().Split('/', StringSplitOptions.RemoveEmptyEntries);
    if (!int.TryParse(identifierParts.LastOrDefault(), out var index))
    {
        return sensor.Name;
    }

    return index switch
    {
        0 => "CPU (PECI)",
        1 => "Mainboard",
        2 => "CPU",
        3 => "Auxiliary",
        4 => "AUXTIN1",
        5 => "AUXTIN2",
        6 => "AUXTIN3",
        _ => sensor.Name
    };
}

static bool IsDisconnectedAuxTemperature(IHardware hardware, ISensor sensor, string sensorName)
{
    if (sensor.Value is null || sensor.Value.Value < 100)
    {
        return false;
    }

    var hardwareIdentity = $"{hardware.HardwareType} {hardware.Identifier}";
    if (!hardwareIdentity.Contains("SuperIO", StringComparison.OrdinalIgnoreCase) &&
        !hardwareIdentity.Contains("/lpc", StringComparison.OrdinalIgnoreCase) &&
        !hardwareIdentity.Contains("Motherboard", StringComparison.OrdinalIgnoreCase))
    {
        return false;
    }

    var compactName = sensorName.Replace(" ", string.Empty, StringComparison.Ordinal);
    return compactName.StartsWith("AUXTIN", StringComparison.OrdinalIgnoreCase) &&
           compactName["AUXTIN".Length..].All(char.IsDigit);
}

static void EnsurePawnIo(string outputDirectory)
{
    var markerPath = Path.Combine(outputDirectory, "pawnio-installed.txt");
    if (LibreHardwareMonitor.PawnIo.PawnIo.IsInstalled)
    {
        File.WriteAllText(markerPath,
            $"Detected {DateTime.UtcNow:O}; version={LibreHardwareMonitor.PawnIo.PawnIo.Version}");
        return;
    }

    var applicationAssembly = Path.Combine(AppContext.BaseDirectory, "LibreHardwareMonitor.dll");
    if (!File.Exists(applicationAssembly))
    {
        throw new FileNotFoundException("LibreHardwareMonitor.dll is required to extract PawnIO.", applicationAssembly);
    }

    var assembly = Assembly.LoadFrom(applicationAssembly);
    const string resourceName = "LibreHardwareMonitor.Resources.PawnIO_setup.exe";
    using var resource = assembly.GetManifestResourceStream(resourceName)
        ?? throw new InvalidOperationException($"Embedded resource {resourceName} was not found.");
    var setupPath = Path.Combine(outputDirectory, "PawnIO_setup.exe");
    using (var target = File.Create(setupPath))
    {
        resource.CopyTo(target);
    }

    using var installer = Process.Start(new ProcessStartInfo
    {
        FileName = setupPath,
        Arguments = "-install -silent",
        UseShellExecute = false,
        CreateNoWindow = true,
        WorkingDirectory = outputDirectory
    }) ?? throw new InvalidOperationException("PawnIO installer did not start.");
    if (!installer.WaitForExit((int)TimeSpan.FromSeconds(45).TotalMilliseconds))
    {
        installer.Kill(true);
        throw new TimeoutException("PawnIO installation timed out.");
    }
    // 3010 is the standard Windows installer result for success with reboot required.
    if (installer.ExitCode != 0 && installer.ExitCode != 3010)
    {
        throw new InvalidOperationException($"PawnIO installation failed with exit code {installer.ExitCode}.");
    }

    File.WriteAllText(markerPath,
        $"Installer completed {DateTime.UtcNow:O}; exitCode={installer.ExitCode}; " +
        $"detected={LibreHardwareMonitor.PawnIo.PawnIo.IsInstalled}; " +
        $"version={LibreHardwareMonitor.PawnIo.PawnIo.Version}");
}

static void AppendLog(string outputDirectory, string message) =>
    File.AppendAllText(
        Path.Combine(outputDirectory, "hardware-probe.log"),
        $"{DateTime.UtcNow:O} {message}{Environment.NewLine}");

internal sealed record ProbeSnapshot(DateTime SampledAt, IReadOnlyList<SensorSnapshot> Sensors);

internal sealed record SensorSnapshot(
    string HardwareId,
    string HardwareType,
    string HardwareName,
    string SensorId,
    string SensorName,
    string SensorType,
    float Value,
    bool ControlSupported = false,
    string? ControlId = null);

internal sealed class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer computer) => computer.Traverse(this);
    public void VisitHardware(IHardware hardware)
    {
        hardware.Update();
        foreach (var child in hardware.SubHardware)
        {
            child.Accept(this);
        }
    }
    public void VisitSensor(ISensor sensor) { }
    public void VisitParameter(IParameter parameter) { }
}
