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

static void CollectSensors(IHardware hardware, List<SensorSnapshot> snapshots)
{
    foreach (var sensor in hardware.Sensors)
    {
        var sensorName = CanonicalSensorName(hardware, sensor);
        if (sensor.Value is null || (sensor.SensorType != SensorType.Temperature && sensor.SensorType != SensorType.Power))
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

        snapshots.Add(new SensorSnapshot(
            hardware.Identifier.ToString(),
            hardware.HardwareType.ToString(),
            hardware.Name.TrimEnd('\0', ' '),
            sensor.Identifier.ToString(),
            sensorName,
            sensor.SensorType.ToString(),
            sensor.Value.Value));
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
    float Value);

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
