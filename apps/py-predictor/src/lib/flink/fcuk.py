# Flink 2.x does to work well with custom connectors if you are not a flink expert
# Spent a week to realize...
# Flink converted 20mil rows into 1 second windows in 11 minutes.
# Just python can do it in 20 seconds. 11 < 20
