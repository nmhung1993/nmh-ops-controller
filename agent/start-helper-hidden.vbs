' Starts the desktop helper without opening a console window.
Option Explicit

Dim shell, fso, nodeExe, helperJs, configFile
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

nodeExe = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
If Not fso.FileExists(nodeExe) Then nodeExe = shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\nodejs\node.exe"
helperJs = fso.GetParentFolderName(WScript.ScriptFullName) & "\desktop-helper.js"
If WScript.Arguments.Count > 0 Then configFile = WScript.Arguments(0)

If fso.FileExists(nodeExe) And fso.FileExists(helperJs) And Len(configFile) > 0 Then
  shell.Run """" & nodeExe & """ """ & helperJs & """ --config """ & configFile & """", 0, False
End If
