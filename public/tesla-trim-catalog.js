/* EPA/DOE US model-year candidates, retrieved 2026-09-07.
 * Source: https://www.fueleconomy.gov/ws/rest/vehicle/menu/model?year=YEAR&make=Tesla
 * Not exhaustive; these are estimates, not vehicle-specific build records.
 * Wheel sizes and EPA -I/-E variants are collapsed; unnamed S/X and battery groups are omitted.
 * See docs/tesla-trim-research.md. */
const TESLA_TRIM_CATALOG = {
    2015: {
        "S": {"awd": ["70D", "85D", "90D"], "performance": ["P85D", "P90D"]},
    },
    2016: {
        "S": {"awd": ["60D", "70D", "75D", "85D", "90D"], "performance": ["P100D", "P85D", "P90D"]},
        "X": {"awd": ["60D", "75D", "90D"], "performance": ["P100D", "P90D"]},
    },
    2017: {
        "3": {"rwd": ["Long Range RWD"]},
        "S": {"awd": ["100D", "60D", "75D", "90D"], "performance": ["P100D", "P90D"]},
        "X": {"awd": ["100D", "60D", "75D", "90D"], "performance": ["P100D", "P90D"]},
    },
    2018: {
        "3": {"rwd": ["Long Range RWD", "Mid Range RWD"], "awd": ["Long Range AWD"], "performance": ["Performance AWD"]},
        "S": {"awd": ["100D", "75D"], "rwd": ["75"], "performance": ["P100D"]},
        "X": {"awd": ["100D", "75D"], "performance": ["P100D"]},
    },
    2019: {
        "3": {"rwd": ["Long Range RWD", "Mid Range RWD", "Standard Range RWD", "Standard Range Plus RWD"], "awd": ["Long Range AWD"], "performance": ["Performance AWD"]},
        "S": {"awd": ["100D", "75D", "Long Range", "Standard Range"], "performance": ["P100D", "Performance"]},
        "X": {"awd": ["100D", "75D", "Long Range"], "performance": ["P100D", "Performance"]},
    },
    2020: {
        "3": {"rwd": ["Long Range RWD", "Mid Range RWD", "Standard Range RWD", "Standard Range Plus RWD"], "awd": ["Long Range AWD"], "performance": ["Performance AWD"]},
        "S": {"awd": ["Long Range", "Long Range Plus", "Standard Range"], "performance": ["Performance"]},
        "X": {"awd": ["Long Range", "Long Range Plus", "Standard Range"], "performance": ["Performance"]},
        "Y": {"awd": ["Long Range AWD"], "performance": ["Performance AWD"]},
    },
    2021: {
        "3": {"awd": ["Long Range AWD"], "performance": ["Performance AWD"], "rwd": ["Standard Range Plus RWD"]},
        "S": {"awd": ["Long Range"], "performance": ["Performance"]},
        "X": {"awd": ["Long Range Plus"], "performance": ["Performance"]},
        "Y": {"awd": ["Long Range AWD"], "performance": ["Performance AWD"], "rwd": ["Standard Range RWD"]},
    },
    2022: {
        "3": {"awd": ["Long Range AWD"], "performance": ["Performance AWD"], "rwd": ["RWD"]},
        "Y": {"awd": ["AWD", "Long Range AWD"], "performance": ["Performance AWD"], "rwd": ["RWD"]},
    },
    2023: {
        "3": {"awd": ["Long Range AWD"], "performance": ["Performance AWD"], "rwd": ["RWD"]},
        "Y": {"awd": ["AWD", "Long Range AWD"], "performance": ["Performance AWD"]},
    },
    2024: {
        "3": {"awd": ["Long Range AWD"], "rwd": ["Long Range RWD", "RWD"], "performance": ["Performance AWD"]},
        "Y": {"awd": ["Long Range AWD"], "rwd": ["Long Range RWD", "RWD"], "performance": ["Performance AWD"]},
    },
    2025: {
        "3": {"awd": ["Long Range AWD"], "rwd": ["Long Range RWD"], "performance": ["Performance AWD"]},
        "Y": {"awd": ["Long Range AWD"], "rwd": ["Long Range RWD"], "performance": ["Performance AWD"]},
    },
    2026: {
        "3": {"performance": ["Performance AWD"], "awd": ["Premium AWD"], "rwd": ["Premium RWD", "Standard RWD"]},
        "Y": {"awd": ["Long Range AWD", "Standard AWD"], "rwd": ["Long Range RWD", "Standard RWD"], "performance": ["Performance AWD"]},
    },
};
