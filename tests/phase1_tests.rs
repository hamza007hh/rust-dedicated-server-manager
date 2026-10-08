use epic_rust_server_launcher::*;

#[test]
fn test_default_config_validity() {
    let config = ServerConfig::default();
    assert!(config.validate().is_ok());
    assert_eq!(config.resolved_query_port(), 28017);
}

#[test]
fn test_command_line_builder_structure() {
    let mut config = ServerConfig::default();
    config.identity = "test_identity".into();
    config.port = 28015;
    config.is_procedural = true;
    config.seed = 4242;
    config.worldsize = 3500;

    let args = build_command_line(&config).expect("command line build failed");
    assert_eq!(args[0], "-batchmode");
    assert_eq!(args[1], "-nographics");
    assert_eq!(args[2], "-noconsole");
    assert!(args.contains(&"+server.identity".to_string()));
    assert!(args.contains(&"test_identity".to_string()));
    assert!(args.contains(&"+server.queryport".to_string()));
    assert!(args.contains(&"28017".to_string()));
    assert!(args.contains(&"+server.seed".to_string()));
    assert!(args.contains(&"4242".to_string()));
}

#[test]
fn test_custom_arguments_validator() {
    let raw = r#"
// managed settings above
// ---- your own arguments, one per line (e.g. -useNewNavmesh) ----
-useNewNavmesh
+fps.limit 120
+spawn.min_rate 0.5
"#;
    let parsed = args::parse_custom_arguments(raw).expect("parsing valid custom args failed");
    assert_eq!(parsed, vec!["-useNewNavmesh", "+fps.limit", "120", "+spawn.min_rate", "0.5"]);

    let invalid = "-useNewNavmesh
+fps.limit"; // Missing value
    assert!(args::parse_custom_arguments(invalid).is_err());
}
