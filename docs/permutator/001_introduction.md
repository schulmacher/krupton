# Feature Dependency Discovery through Decision Tree Permutations

## Decision tree for timeseries data

The decision tree algorithm is inherently designed to predict binary outcomes. In contrast, cryptocurrency time series data are continuous, and the corresponding trade prices are also continuous variables.  
To construct a decision tree model for time series data, the sequential data points must be transformed into a tabular format in which each row represents a fixed-length temporal window. This process generates _synthetic features_ for each entry, denoted as:

\[
x*{-2}^{(f)} = 1, \quad x*{-1}^{(f)} = 0, \quad x\_{0}^{(f)} = 0
\]

where \( x*{t}^{(f)} \) represents the value of feature \( f \) at a relative time offset \( t \) from the current point.  
Features with negative or zero offsets (\( x*{-n}^{(f)} \) or \( x*{0}^{(f)} \)) are used as predictors, while features with positive offsets (\( x*{+1}^{(f)} \)) represent the *target* to be predicted.

### Example

**Table 1.** Cryptocurrency time series data for a single symbol

| time  | 1      | 2      | 3      | 4      | 5      |
| ----- | ------ | ------ | ------ | ------ | ------ |
| value | 100000 | 122200 | 133300 | 100044 | 155500 |

**Table 2.** Synthetic data for a decision tree using three time points per row (starting from time 2).  
The `time_rows` column is included only for illustration and is not part of the actual dataset.

| time_rows | -1_up_20p | -1_up_5p | 0_up_20p | 0_up_5p | +1_up_5p |
| --------- | --------- | -------- | -------- | ------- | -------- |
| 2,3,4     | 1         | 1        | 0        | 1       | 1        |
| 3,4,5     | 1         | 1        | 0        | 0       | 1        |

From this example, we can observe that for two synthetic features (`up_5p` and `up_20p`) and three time points, the total number of features generated is:

\[
F = (T \times S) + 1
\]

where

- \( T \) = number of time points,
- \( S \) = number of synthetic features per time point, and
- the additional \( +1 \) corresponds to the target feature to be predicted.

For instance, with \( T = 2 \) and \( S = 2 \), we have \( F = (2 \times 2) + 1 = 5 \).  
Adding one more time point results in \( F = (3 \times 2) + 1 = 7 \).  
If the number of synthetic features is increased to \( S = 5 \) with \( T = 3 \), the total becomes \( F = (3 \times 5) + 1 = 16 \).

The order of growth with respect to both the time window length \( T \) and the number of synthetic features \( S \) is:

\[
O(T \times S)
\]

This indicates a linear growth in feature count with respect to each dimension.

### Adding more symbols
**Table 3.** Cryptocurrency time series data with multiple symbols

| symbol  | time | value  |
| ------- | ---- | ------ |
| BTCUSDT | 1    | 100000 |
| ETHKAS  | 1    | 0.001  |
| BTCUSDT | 2    | 120000 |
| ...     | ...  | ...    |

When multiple currency pairs (symbols) are included in the same dataset, each symbol contributes its own set of time-dependent synthetic features.  
The time series for each symbol are aligned by timestamp and combined into a single row representing a fixed-length temporal window across all symbols.

**Table 4.** Synthetic data for a decision tree using three time points per row (starting from time 2) and two currencies (BTC/USDT and ETH/KAS).  
Only one future feature (+1) per symbol is included as the prediction target.

| -1_btcusdt_up_5p | 0_btcusdt_up_5p | -1_ethkas_up_5p | 0_ethkas_up_5p | +1_ethkas_up_5p | +1_btcusdt_up_5p |
| ---------------- | --------------- | --------------- | -------------- | --------------- | ---------------- |
| 1                | 1               | 0               | 1              | 1               | x                |
| 1                | 0               | 1               | 0              | 1               | x                |
| 1                | 0               | 1               | 0              | x               | 1                |
| 1                | 0               | 1               | 0              | x               | 1                |

In this configuration, each currency contributes its own lagged and current features (\(x_{-n}^{(f)}\) and \(x_{0}^{(f)}\)), while only one of the currencies provides the predictive target feature (\(x_{+1}^{(f)}\)).  
This setup allows the model to use all currencies as contextual predictors but to forecast only one target symbol.

If each currency contributes \(C_i\) synthetic features and the temporal window spans \(T\) time points, the total number of predictor features \(F_p\) (excluding the single prediction target) is:

\[
F_p = \sum_{i=1}^{n} (C_i \times T)
\]

Including one prediction target feature for a specific symbol, the total number of columns in the dataset becomes:

\[
F = \left( \sum_{i=1}^{n} (C_i \times T) \right) + 1
\]

The order of growth with respect to the number of time points and features per currency remains linear:

\[
O(T \times \sum_{i=1}^{n} C_i)
\]
## Example of Feature Growth

To illustrate the impact of increasing the number of features per symbols target feature, consider a temporal window of \(T = 3\) and \(n = 6\) symbols:

1. **Six symbols**, each contributing \(C = 8\) synthetic features:
   \[
   F = (6 \times 8 \times 3) + 1 = 145
   \]

2. **Six symbols**, each contributing \(C = 10\) synthetic features:
   \[
   F = (6 \times 10 \times 3) + 1 = 181
   \]

This comparison demonstrates that adding just two additional features per symbol results in a substantial increase in dimensionality—from 145 to 181 columns—highlighting how feature count growth scales rapidly with both the number of symbols and the number of features per symbol.

---

## Permutator

The purpose of the *Permutator* is to identify dependencies between features by constructing decision tree models over different combinations of predictive and target variables.

### All permutations
For a given set of predictive features \( P = \{p_1, p_2, \dots, p_m\} \) and a single **target feature** \( t \), the system evaluates every possible predictive subset of \( P \) to determine how each combination contributes to predicting \( t \).

Since only one future feature (\(+1\)) can be used as the prediction target — future values are unknown at inference time — the model operates under the constraint that:

\[
|t| = 1
\]

The temporal window \(T\) still defines how many past time points are used to form the predictive features (\(x_{-T}, \dots, x_{-1}, x_{0}\)), but only one feature from the future (\(x_{+1}\)) is used as the prediction target.

Formally, the number of possible predictive subsets for the target feature is:

\[
N = 2^{|P|} - 1
\]

and the total number of decision tree models to be trained is therefore:

\[
M = 2^{|P|} - 1
\]

The computational complexity grows exponentially with the number of predictive features:

\[
O(2^{|P|})
\]


### Example of Permutation Growth

Using the same setup as in the *Example of Feature Growth*, where \(n = 6\) symbols and \(T = 3\):

1. **Each symbol contributes \(C = 8\) synthetic features**  
   The total number of predictive features is:
   \[
   |P| = 6 \times 8 \times 3 = 144
   \]
   The total number of permutations (decision trees) is therefore:
   \[
   M = 2^{144} - 1 \approx 2 \times 10^{45}
   \]

2. **Each symbol contributes \(C = 10\) synthetic features**  
   The total number of predictive features is:
   \[
   |P| = 6 \times 10 \times 3 = 180
   \]
   The total number of permutations (decision trees) is:
   \[
   M = 2^{180} - 1 \approx 2 \times 10^{84}
   \]

These values correspond to the case where the system attempts to **predict a single target feature** (for example, \( +1_{\text{ethkas\_up\_5p}} \)) using all available predictive features across all symbols.

---

If the goal is instead to **predict each feature of a symbol individually**, then a separate decision tree model must be trained for each feature.  
In this case, the total number of models increases linearly with the number of target features:

\[
M_{\text{all}} = |T| \times (2^{|P|} - 1)
\]

where \( |T| \) is the number of target features to be predicted (for instance, all future features across all symbols).

For the same configurations:

1. **Six symbols with \(C = 8\) synthetic features each**  
   Assuming each of the \(6 \times 8 = 48\) features is a target once:
   \[
   M_{\text{all}} = 48 \times (2^{144} - 1) \approx 48 \times 2 \times 10^{45} = 9.6 \times 10^{46}
   \]

2. **Six symbols with \(C = 10\) synthetic features each**  
   Assuming each of the \(6 \times 10 = 60\) features is a target once:
   \[
   M_{\text{all}} = 60 \times (2^{180} - 1) \approx 60 \times 2 \times 10^{84} = 1.2 \times 10^{86}
   \]

---

This demonstrates that even though the per-feature permutation space is already exponential,  
attempting to model **every feature as a separate prediction target** multiplies the total computational load further by the number of target features — making brute-force dependency exploration entirely infeasible without approximation or constraint-based reduction methods.
