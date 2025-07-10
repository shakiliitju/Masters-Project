
    document.getElementById('csvFile').addEventListener('change', function (e) {
        if (!e.target.files.length) return;
        Papa.parse(e.target.files[0], {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: function(results) {
                const data = results.data;
                renderDashboard(data);
            }
        });
    });

    function renderDashboard(data) {
        // Extract columns
        const columns = Object.keys(data[0]);
        const amountCol = columns.find(c => c.toLowerCase() === 'amount');
        const classCol = columns.find(c => c.toLowerCase() === 'class');
        const timeCol = columns.find(c => c.toLowerCase() === 'time');
        const featureCols = columns.filter(c => /^v\d+$/i.test(c));

        // 1. Class Distribution
        const classCounts = data.reduce((acc, row) => {
            acc[row[classCol]] = (acc[row[classCol]] || 0) + 1;
            return acc;
        }, {});
        Plotly.newPlot('class-distribution', [{
            x: Object.keys(classCounts).map(cl => cl == 1 ? 'Fraudulent' : 'Non-Fraudulent'),
            y: Object.values(classCounts),
            type: 'bar',
            marker: { color: ['#2ecc40', '#ff4136'] }
        }], {
            title: 'Transaction Class Distribution',
            xaxis: { title: 'Class' },
            yaxis: { title: 'Count' },
            paper_bgcolor: 'rgba(255,255,255,0.0)',
            plot_bgcolor: 'rgba(255,255,255,0.0)'
        });

        // 2. Transaction Amount Distribution
        const amounts = data.map(row => row[amountCol]);
        const classes = data.map(row => row[classCol]);
        Plotly.newPlot('amount-distribution', [
            {
                x: amounts.filter((_, i) => classes[i] == 0),
                type: 'histogram',
                name: 'Non-Fraudulent',
                marker: { color: '#2ecc40' },
                opacity: 0.7
            },
            {
                x: amounts.filter((_, i) => classes[i] == 1),
                type: 'histogram',
                name: 'Fraudulent',
                marker: { color: '#ff4136' },
                opacity: 0.7
            }
        ], {
            barmode: 'overlay',
            title: 'Transaction Amount Distribution',
            xaxis: { title: 'Amount' },
            yaxis: { title: 'Count' },
            paper_bgcolor: 'rgba(255,255,255,0.0)',
            plot_bgcolor: 'rgba(255,255,255,0.0)'
        });

        // 3. Time-Based Trends
        let timeBuckets = {};
        data.forEach(row => {
            let bucket = Math.floor(row[timeCol] / 3600); // hourly buckets
            if (!timeBuckets[bucket]) timeBuckets[bucket] = { fraud: 0, nonfraud: 0 };
            if (row[classCol] == 1) timeBuckets[bucket].fraud++;
            else timeBuckets[bucket].nonfraud++;
        });
        const buckets = Object.keys(timeBuckets).map(Number).sort((a, b) => a - b);
        Plotly.newPlot('time-trends', [
            {
                x: buckets,
                y: buckets.map(b => timeBuckets[b].nonfraud),
                type: 'scatter',
                mode: 'lines',
                name: 'Non-Fraudulent',
                line: { color: '#2ecc40' }
            },
            {
                x: buckets,
                y: buckets.map(b => timeBuckets[b].fraud),
                type: 'scatter',
                mode: 'lines',
                name: 'Fraudulent',
                line: { color: '#ff4136' }
            }
        ], {
            title: 'Transactions Over Time (Hourly Buckets)',
            xaxis: { title: 'Hour' },
            yaxis: { title: 'Count' },
            paper_bgcolor: 'rgba(255,255,255,0.0)',
            plot_bgcolor: 'rgba(255,255,255,0.0)'
        });

        // 4. Correlation Heatmap (V1-V28 + Amount + Class)
        function computeCorrelationMatrix(data, features) {
            function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
            function std(arr, m) { return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length); }
            function corr(x, y) {
                const mx = mean(x), my = mean(y);
                const sx = std(x, mx), sy = std(y, my);
                const cov = x.reduce((a, xi, i) => a + (xi - mx) * (y[i] - my), 0) / x.length;
                return cov / (sx * sy);
            }
            let matrix = [];
            for (let i = 0; i < features.length; i++) {
                matrix[i] = [];
                for (let j = 0; j < features.length; j++) {
                    const xi = data.map(row => row[features[i]]);
                    const xj = data.map(row => row[features[j]]);
                    matrix[i][j] = corr(xi, xj);
                }
            }
            return matrix;
        }
        const heatmapFeatures = [...featureCols, amountCol, classCol];
        const corrMatrix = computeCorrelationMatrix(data, heatmapFeatures);
        Plotly.newPlot('correlation-heatmap', [{
            z: corrMatrix,
            x: heatmapFeatures,
            y: heatmapFeatures,
            type: 'heatmap',
            colorscale: 'RdBu',
            zmin: -1, zmax: 1,
            colorbar: { title: 'Correlation' }
        }], {
            title: 'Correlation Heatmap',
            xaxis: { side: 'top' },
            paper_bgcolor: 'rgba(255,255,255,0.0)',
            plot_bgcolor: 'rgba(255,255,255,0.0)'
        });

        // 5. Top Contributing Features for Fraudulent Transactions
        let fraudRows = data.filter(row => row[classCol] == 1);
        let nonFraudRows = data.filter(row => row[classCol] == 0);
        let featureDiffs = featureCols.map(f => {
            let meanFraud = fraudRows.reduce((a, r) => a + r[f], 0) / (fraudRows.length || 1);
            let meanNonFraud = nonFraudRows.reduce((a, r) => a + r[f], 0) / (nonFraudRows.length || 1);
            return { feature: f, diff: Math.abs(meanFraud - meanNonFraud) };
        });
        featureDiffs.sort((a, b) => b.diff - a.diff);
        let topFeatures = featureDiffs.slice(0, 10);
        Plotly.newPlot('feature-importance', [{
            x: topFeatures.map(f => f.feature),
            y: topFeatures.map(f => f.diff),
            type: 'bar',
            marker: { color: '#0074D9' }
        }], {
            title: 'Top 10 Features Differentiating Fraudulent Transactions',
            xaxis: { title: 'Feature' },
            yaxis: { title: 'Mean Difference' },
            paper_bgcolor: 'rgba(255,255,255,0.0)',
            plot_bgcolor: 'rgba(255,255,255,0.0)'
        });
    }