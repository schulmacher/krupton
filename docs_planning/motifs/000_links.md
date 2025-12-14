# Motifs and Matrix Profiles for Pattern Matching

## Overview

Pattern matching in time series data has evolved significantly with the introduction of matrix profiles and motif discovery algorithms. This document provides a curated list of recent scientific literature on these topics.

Lots of papers here: https://www.cs.ucr.edu/~eamonn/MatrixProfile.html

## Introductory Concepts

### What Are Motifs?

Motifs are recurring, approximately repeated subsequences within a time series that represent fundamental patterns. These patterns are crucial for various analytical tasks such as classification, clustering, and anomaly detection.

### Foundational Matrix Profile Papers

1. **Matrix Profile I: All Pairs Similarity Joins for Time Series: A Unifying View that Includes Motifs, Discords and Shapelets**  
   Yeh, C.-C. M., et al. (2016). The foundational paper introducing the matrix profile concept, which revolutionized time series data mining by providing a unified approach to motif discovery, anomaly detection, and shape analysis.  
   [IEEE ICDM 2016](https://sites.google.com/site/icdmstamp/)

2. **Towards a Near Universal Time Series Data Mining Tool: Introducing the Matrix Profile**  
   Yeh, C.-C. M. (2018). A comprehensive introduction to the matrix profile as a versatile tool for time series data mining, demonstrating its utility across diverse domains including seismology, bioinformatics, and medicine. Covers motif discovery, discord discovery, shapelet discovery, and semantic segmentation.  
   [arXiv:1811.03064](https://arxiv.org/abs/1811.03064)

3. **Time Series Data Mining Using Matrix Profiling: A Unifying View of Motif Discovery, Anomaly Detection, Segmentation, Classification, and Similarity Joins**  
   Mueen, A., & Keogh, E. (2017). KDD 2017 tutorial providing an accessible overview of the matrix profile and its applications in various time series data mining tasks.  
   [Tutorial Website](https://www.cs.unm.edu/~mueen/Tutorial/KDD2017MatrixProfile.html)

### Recent Introductory Works (2021-2024)

4. **Motiflets -- Simple and Accurate Detection of Motifs in Time Series**  
   Schäfer, P., & Leser, U. (2022). Introduces k-Motiflets, a simplified method for motif discovery that finds exactly k occurrences with minimal pairwise distance, reducing parameter selection complexity and improving interpretability.  
   [arXiv:2206.03735](https://arxiv.org/abs/2206.03735)

5. **Framework for Variable-lag Motif Following Relation Inference in Time Series using Matrix Profile Analysis**  
   Chinpattanakarn, N., & Amornbunchornvej, C. (2024). Formalizes the concept of following motifs between two time series and presents a framework utilizing the matrix profile method to infer temporal patterns.  
   [arXiv:2401.02860](https://arxiv.org/abs/2401.02860)

6. **Financial Time Series: Market Analysis Techniques Based on Matrix Profiles**  
   Cartwright, E., Crane, M., & Ruskin, H. J. (2021). Examines the application of the matrix profile algorithm to financial time series, proposing approaches for identifying similar behavior patterns (motifs) in market data.  
   [DCU Research Repository](https://doras.dcu.ie/26068/)

## Matrix Profile Methods

### Foundational Works

1. **tsmp: An R Package for Time Series with Matrix Profile**  
   Bischoff, F., & Rodrigues, P. P. (2019). The 'tsmp' package implements the matrix profile concept for time series analysis, facilitating tasks such as all-pairs similarity joins, motif discovery, and semantic segmentation.  
   [arXiv:1904.12626](https://arxiv.org/abs/1904.12626)

2. **Matrix Profile XXII: Exact Discovery of Time Series Motifs under DTW**  
   Alaee, S., et al. (2020). Presents a scalable exact method for discovering time series motifs under Dynamic Time Warping (DTW) with novel hierarchy of lower bounds representation.  
   [arXiv:2009.07907](https://arxiv.org/abs/2009.07907)

3. **Matrix Profile Goes MAD: Variable-Length Motif And Discord Discovery in Data Series**  
   Linardi, M., et al. (2020). Introduces a framework for exact and scalable motif and discord discovery in data series, accommodating a range of motif lengths. Demonstrated to be up to 20 times faster than previous methods.  
   [arXiv:2008.13447](https://arxiv.org/abs/2008.13447)

### Industrial Applications

4. **Practical Joint Human-Machine Exploration of Industrial Time Series Using the Matrix Profile**  
   (2022). Discusses a method for human experts to collaborate with the Matrix Profile and motifs to analyze and explore industrial time series, offering a parameterless procedure for motif extraction and clustering.  
   [Springer Link](https://link.springer.com/article/10.1007/s10618-022-00871-y)

## Advanced Motif Discovery Algorithms

### Recent Advances (2023-2025)

5. **LoCoMotif: Discovering Time-Warped Motifs in Time Series**  
   Van Wesenbeeck, D., et al. (2023). A method that identifies patterns occurring multiple times in a time series, accommodating variability along the time axis and handling multivariate time series.  
   [arXiv:2311.17582](https://arxiv.org/abs/2311.17582)

6. **Quantum Algorithm for Position Weight Matrix Matching**  
   Miyamoto, K., Yamamoto, N., & Sakakibara, Y. (2023). Introduces quantum algorithms designed to identify sequence motifs in biological sequences using position weight matrices (PWMs).  
   [arXiv:2303.03569](https://arxiv.org/abs/2303.03569)

7. **MAFin: Motif Detection in Multiple Alignment Files**  
   Patsakis, M., et al. (2024). A tool for efficient motif detection and conservation analysis in Multiple Alignment Format (MAF) files, streamlining genomic and proteomic research.  
   [arXiv:2410.11021](https://arxiv.org/abs/2410.11021)

8. **Discovering Motifs to Fingerprint Multi-Layer Networks: A Case Study on the Connectome of C. elegans**  
   (2025). Applies motif discovery methods to the multi-layer nervous system of Caenorhabditis elegans, identifying network motifs linked to functional circuits.  
   [Springer Link](https://link.springer.com/article/10.1140/epjb/s10051-024-00848-4)

## Pattern Matching on Weighted Sequences

9. **Pattern Matching and Consensus Problems on Weighted Sequences and Profiles**  
   Gawrychowski, P., et al. (2019). Explores pattern matching problems on weighted sequences and profiles, which are representations of uncertain sequences used in molecular biology. Presents efficient algorithms for these problems.  
   [Springer Link](https://link.springer.com/article/10.1007/s00224-018-9881-2)

10. **Comparison of Discriminative Motif Optimization Using Matrix and DNA Shape-Based Models**  
    Ruan, S., & Stormo, G. D. (2018). Compares motif optimization using position weight matrices and DNA shape-based models, highlighting differences in their effectiveness.  
    [BMC Bioinformatics](https://bmcbioinformatics.biomedcentral.com/articles/10.1186/s12859-018-2104-7)

## Specialized Tools and Methods

11. **SMOTIF: Efficient Structured Pattern and Profile Motif Search**  
    Backofen, R., et al. (2006). A tool for efficient search of structured patterns and profile motifs in biological sequences, addressing both exact and approximate matching.  
    [Algorithms for Molecular Biology](https://almob.biomedcentral.com/articles/10.1186/1748-7188-1-22)

12. **MATLIGN: A Motif Clustering, Comparison and Matching Tool**  
    A tool designed to group and compare sequence motifs, aiding in the annotation of motifs and reducing redundancy in motif prediction results.  
    [BMC Bioinformatics](https://bmcbioinformatics.biomedcentral.com/articles/10.1186/1471-2105-8-189)

13. **MODSIDE: A Motif Discovery Pipeline and Similarity Detector**  
    A pipeline that integrates multiple motif discovery tools and a similarity detection module, facilitating comprehensive motif analysis and comparison.  
    [BMC Genomics](https://bmcgenomics.biomedcentral.com/articles/10.1186/s12864-018-5148-1)

14. **ARTEM: A Method for RNA and DNA Tertiary Motif Identification with Backbone Permutations**  
    (2025). A method for identifying various types of RNA and DNA tertiary motifs, demonstrating broad applicability in nucleic acid motif detection.  
    [Genome Biology](https://genomebiology.biomedcentral.com/articles/10.1186/s13059-025-03696-2)

15. **HSEARCH: Fast and Accurate Protein Sequence Motif Search and Clustering**  
    (2017). Presents an algorithm that converts fixed-length protein sequences into high-dimensional data points and applies locality-sensitive hashing for rapid motif search and clustering.  
    [arXiv:1701.00452](https://arxiv.org/abs/1701.00452)

## Additional Resources

16. **Efficient Exact Motif Discovery**  
    (2009). Presents an exact and efficient approach to motif discovery, addressing the challenge of finding over-represented patterns in biosequences using IUPAC generalized string patterns.  
    [Oxford Academic](https://academic.oup.com/bioinformatics/article/25/12/i356/187108)

17. **Learning Common and Specific Patterns from Data of Multiple Interrelated Biological Scenarios with Matrix Factorization**  
    (2019). Introduces a matrix factorization-based method for identifying common and specific patterns across multiple interrelated biological scenarios.  
    [Nucleic Acids Research](https://academic.oup.com/nar/article/47/13/6606/5512984)

